import type { LlmConfig } from "@migite/core";
import { LlmError } from "./errors.js";
import { type ResolvedRoleModel, resolveRoleModel } from "./roles.js";
import type {
  ChatChunk,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatUsage,
  FinishReason,
  LLMClient,
  LLMRole,
  ToolCall,
  ToolCallDelta,
  ToolChoice,
} from "./types.js";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface OpenAICompatDeps {
  readonly fetch?: FetchLike;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  isRecord(value) ? value : {};

const isNumberArray = (value: unknown): value is readonly number[] =>
  Array.isArray(value) && value.every((item) => typeof item === "number");

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

const joinUrl = (baseUrl: string, path: string): string => `${baseUrl.replace(/\/+$/, "")}${path}`;

const redact = (text: string, secret: string): string =>
  secret === "" ? text : text.split(secret).join("[redactado]");

const mapFinishReason = (value: unknown): FinishReason => {
  switch (value) {
    case "length":
    case "tool_calls":
    case "content_filter":
    case "stop":
      return value;
    default:
      return "stop";
  }
};

const parseToolArguments = (raw: unknown): Record<string, unknown> => {
  if (typeof raw !== "string" || raw.trim() === "") {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? { ...parsed } : {};
  } catch {
    return {};
  }
};

const parseUsage = (value: unknown): ChatUsage | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const promptTokens = asNumber(value.prompt_tokens);
  const completionTokens = asNumber(value.completion_tokens);
  const totalTokens = asNumber(value.total_tokens);
  if (promptTokens === undefined || completionTokens === undefined || totalTokens === undefined) {
    return undefined;
  }
  return { promptTokens, completionTokens, totalTokens };
};

const toWireMessage = (message: ChatMessage): Record<string, unknown> => {
  const wire: Record<string, unknown> = { role: message.role, content: message.content };
  if (message.name !== undefined) {
    wire.name = message.name;
  }
  if (message.toolCallId !== undefined) {
    wire.tool_call_id = message.toolCallId;
  }
  if (message.toolCalls !== undefined && message.toolCalls.length > 0) {
    wire.tool_calls = message.toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: "function",
      function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) },
    }));
  }
  return wire;
};

const toWireToolChoice = (choice: ToolChoice): unknown =>
  typeof choice === "string" ? choice : { type: "function", function: { name: choice.name } };

const buildChatBody = (
  model: string,
  request: ChatRequest,
  stream: boolean,
): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    model,
    messages: request.messages.map(toWireMessage),
    stream,
  };

  const options = request.options;
  if (options !== undefined) {
    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }
    if (options.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens;
    }
    if (options.topP !== undefined) {
      body.top_p = options.topP;
    }
    if (options.stop !== undefined && options.stop.length > 0) {
      body.stop = [...options.stop];
    }
  }

  if (request.tools !== undefined && request.tools.length > 0) {
    body.tools = request.tools.map((tool) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
  }

  if (request.toolChoice !== undefined) {
    body.tool_choice = toWireToolChoice(request.toolChoice);
  }

  return body;
};

const parseToolCall = (entry: unknown, index: number): ToolCall => {
  const record = asRecord(entry);
  const fn = asRecord(record.function);
  return {
    id: typeof record.id === "string" ? record.id : `tool-call-${index}`,
    name: typeof fn.name === "string" ? fn.name : "",
    arguments: parseToolArguments(fn.arguments),
  };
};

const parseToolCalls = (value: unknown): ToolCall[] =>
  Array.isArray(value) ? value.map((entry, index) => parseToolCall(entry, index)) : [];

const parseChatResponse = (raw: unknown): ChatResponse => {
  const root = asRecord(raw);
  const choices = Array.isArray(root.choices) ? root.choices : [];
  if (choices.length === 0) {
    const error = asRecord(root.error);
    const detail = typeof error.message === "string" ? error.message : "respuesta sin choices";
    throw new LlmError(`respuesta de chat inválida: ${detail}`);
  }

  const choice = asRecord(choices[0]);
  const message = asRecord(choice.message);
  const usage = parseUsage(root.usage);

  return {
    message: {
      content: typeof message.content === "string" ? message.content : "",
      toolCalls: parseToolCalls(message.tool_calls),
    },
    finishReason: mapFinishReason(choice.finish_reason),
    ...(usage === undefined ? {} : { usage }),
  };
};

const parseToolCallDeltas = (value: unknown): ToolCallDelta[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const deltas: ToolCallDelta[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    const fn = asRecord(record.function);
    const index = asNumber(record.index);
    if (index === undefined) {
      continue;
    }
    deltas.push({
      index,
      ...(typeof record.id === "string" ? { id: record.id } : {}),
      ...(typeof fn.name === "string" ? { name: fn.name } : {}),
      ...(typeof fn.arguments === "string" ? { argumentsDelta: fn.arguments } : {}),
    });
  }
  return deltas;
};

const parseStreamChunk = (raw: unknown): ChatChunk | undefined => {
  const root = asRecord(raw);
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const choice = asRecord(choices[0]);
  const delta = asRecord(choice.delta);

  const contentDelta =
    typeof delta.content === "string" && delta.content !== "" ? delta.content : undefined;
  const toolCallDeltas = parseToolCallDeltas(delta.tool_calls);
  const finishReason =
    typeof choice.finish_reason === "string" ? mapFinishReason(choice.finish_reason) : undefined;
  const usage = parseUsage(root.usage);

  if (
    contentDelta === undefined &&
    toolCallDeltas.length === 0 &&
    finishReason === undefined &&
    usage === undefined
  ) {
    return undefined;
  }

  return {
    ...(contentDelta === undefined ? {} : { contentDelta }),
    ...(toolCallDeltas.length === 0 ? {} : { toolCallDeltas }),
    ...(finishReason === undefined ? {} : { finishReason }),
    ...(usage === undefined ? {} : { usage }),
  };
};

const parseEmbeddings = (raw: unknown): number[][] => {
  const root = asRecord(raw);
  if (!Array.isArray(root.data)) {
    throw new LlmError("respuesta de embeddings sin campo data");
  }
  return root.data.map((entry, index) => {
    const embedding = asRecord(entry).embedding;
    if (!isNumberArray(embedding)) {
      throw new LlmError(`embedding inválido en la posición ${index}`);
    }
    return [...embedding];
  });
};

const extractProviderMessage = (body: string): string => {
  const trimmed = body.trim();
  if (trimmed === "") {
    return "";
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const error = asRecord(asRecord(parsed).error);
    if (typeof error.message === "string" && error.message !== "") {
      return error.message;
    }
  } catch {
    return trimmed;
  }
  return trimmed;
};

const toHttpError = async (response: Response, url: string, apiKey: string): Promise<LlmError> => {
  const body = await response.text().catch(() => "");
  const detail = extractProviderMessage(body) || response.statusText;
  const suffix = detail === "" ? "" : `: ${redact(detail, apiKey)}`;
  return new LlmError(`el proveedor respondió ${response.status} en ${url}${suffix}`);
};

const dataLines = (event: string): string[] => {
  const lines: string[] = [];
  for (const line of event.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data:")) {
      lines.push(trimmed.slice("data:".length).trim());
    }
  }
  return lines;
};

async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      for (const event of events) {
        for (const data of dataLines(event)) {
          if (data === "[DONE]") {
            return;
          }
          yield data;
        }
      }
    }
    for (const data of dataLines(buffer)) {
      if (data === "[DONE]") {
        return;
      }
      yield data;
    }
  } finally {
    reader.releaseLock();
  }
}

export const createOpenAICompatClient = (
  llmConfig: LlmConfig,
  deps: OpenAICompatDeps = {},
): LLMClient => {
  const fetchFn: FetchLike = deps.fetch ?? fetch;
  const env = deps.env ?? process.env;

  const send = async (
    resolved: ResolvedRoleModel,
    path: string,
    body: Record<string, unknown>,
  ): Promise<{ response: Response; url: string; apiKey: string }> => {
    const apiKey = env[resolved.apiKeyEnv];
    if (apiKey === undefined || apiKey === "") {
      throw new LlmError(
        `falta la variable de entorno "${resolved.apiKeyEnv}" con la clave del proveedor "${resolved.providerId}" (BYOK)`,
      );
    }

    const url = joinUrl(resolved.baseUrl, path);
    let response: Response;
    try {
      response = await fetchFn(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new LlmError(
        `no se pudo contactar con el proveedor "${resolved.providerId}" en ${url}`,
        {
          cause,
        },
      );
    }

    if (!response.ok) {
      throw await toHttpError(response, url, apiKey);
    }

    return { response, url, apiKey };
  };

  const readJson = async (response: Response, url: string): Promise<unknown> => {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new LlmError(`respuesta no JSON del proveedor en ${url}`);
    }
  };

  return {
    async chat(role: LLMRole, request: ChatRequest): Promise<ChatResponse> {
      const resolved = resolveRoleModel(llmConfig, role);
      const { response, url } = await send(
        resolved,
        "/chat/completions",
        buildChatBody(resolved.model, request, false),
      );
      return parseChatResponse(await readJson(response, url));
    },

    async *chatStream(role: LLMRole, request: ChatRequest): AsyncIterable<ChatChunk> {
      const resolved = resolveRoleModel(llmConfig, role);
      const { response, url, apiKey } = await send(
        resolved,
        "/chat/completions",
        buildChatBody(resolved.model, request, true),
      );
      if (response.body === null) {
        throw new LlmError(`el proveedor no devolvió un cuerpo de streaming en ${url}`);
      }

      for await (const data of readSseEvents(response.body)) {
        let raw: unknown;
        try {
          raw = JSON.parse(data);
        } catch {
          throw new LlmError(
            `evento SSE con JSON inválido del proveedor en ${url}: ${redact(data.slice(0, 200), apiKey)}`,
          );
        }
        const chunk = parseStreamChunk(raw);
        if (chunk !== undefined) {
          yield chunk;
        }
      }
    },

    async embed(role: LLMRole, texts: readonly string[]): Promise<number[][]> {
      const resolved = resolveRoleModel(llmConfig, role);
      const { response, url } = await send(resolved, "/embeddings", {
        model: resolved.model,
        input: [...texts],
      });
      return parseEmbeddings(await readJson(response, url));
    },
  };
};
