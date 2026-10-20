import { randomUUID } from "node:crypto";
import type { LlmConfig } from "@migite/core";
import { LlmError } from "./errors.js";
import { type ResolvedRoleModel, resolveRoleModel } from "./roles.js";
import { marcarArgumentosIlegibles } from "./runtime.js";
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
  readonly timeoutMs?: number;
}

interface RequestSession {
  readonly response: Response;
  readonly url: string;
  readonly apiKey: string;
  readonly providerId: string;
  readonly timedOut: () => boolean;
  readonly finish: () => void;
  readonly cancel: () => void;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_EVENT_BYTES = 1_000_000;
const MAX_STREAM_BYTES = 8_000_000;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

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

const isLoopbackHost = (hostname: string): boolean => {
  const lower = hostname.toLowerCase();
  const host = lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower;
  return LOOPBACK_HOSTS.has(host);
};

const assertSecureBaseUrl = (providerId: string, baseUrl: string): void => {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new LlmError(`baseUrl inválida en el proveedor "${providerId}": ${baseUrl}`);
  }
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
    throw new LlmError(
      `el proveedor "${providerId}" usa http:// en ${baseUrl} y la clave viajaría sin cifrar; usa https:// o expón el proveedor en loopback (localhost, 127.0.0.1 o ::1)`,
    );
  }
};

const utf8 = new TextEncoder();

const byteLength = (text: string): number => utf8.encode(text).byteLength;

const assertWithinBytes = (text: string, limit: number, what: string): void => {
  if (byteLength(text) > limit) {
    throw new LlmError(`${what} supera el máximo de ${limit} bytes`);
  }
};

const timeoutError = (providerId: string, url: string, timeoutMs: number): LlmError =>
  new LlmError(
    `tiempo de espera agotado (timeoutMs=${timeoutMs}) al contactar con el proveedor "${providerId}" en ${url}`,
  );

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
    return isRecord(parsed) ? { ...parsed } : marcarArgumentosIlegibles({});
  } catch {
    return marcarArgumentosIlegibles({});
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
      ...(toolCall.extraContent === undefined ? {} : { extra_content: toolCall.extraContent }),
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
  const extraContent = isRecord(record.extra_content) ? { ...record.extra_content } : undefined;
  return {
    id: typeof record.id === "string" && record.id !== "" ? record.id : `tool-call-${index}`,
    name: typeof fn.name === "string" ? fn.name : "",
    arguments: parseToolArguments(fn.arguments),
    ...(extraContent === undefined ? {} : { extraContent }),
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

interface StreamToolCallIndexState {
  readonly byId: Map<string, number>;
  nextIndex: number;
}

const createStreamToolCallIndexState = (): StreamToolCallIndexState => ({
  byId: new Map<string, number>(),
  nextIndex: 0,
});

const resolveToolCallDeltaIndex = (
  explicitIndex: number | undefined,
  id: string | undefined,
  position: number,
  state: StreamToolCallIndexState,
): number => {
  if (explicitIndex !== undefined) {
    if (id !== undefined) {
      state.byId.set(id, explicitIndex);
    }
    state.nextIndex = Math.max(state.nextIndex, explicitIndex + 1);
    return explicitIndex;
  }
  if (id !== undefined) {
    const existing = state.byId.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const allocated = state.nextIndex;
    state.nextIndex += 1;
    state.byId.set(id, allocated);
    return allocated;
  }
  return position;
};

const parseToolCallDeltas = (
  value: unknown,
  indexState: StreamToolCallIndexState,
): ToolCallDelta[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const deltas: ToolCallDelta[] = [];
  for (const [position, entry] of value.entries()) {
    const record = asRecord(entry);
    const fn = asRecord(record.function);
    const id = typeof record.id === "string" && record.id !== "" ? record.id : undefined;
    const name = typeof fn.name === "string" && fn.name !== "" ? fn.name : undefined;
    const index = resolveToolCallDeltaIndex(asNumber(record.index), id, position, indexState);
    const extraContent = isRecord(record.extra_content) ? { ...record.extra_content } : undefined;
    deltas.push({
      index,
      ...(id === undefined ? {} : { id }),
      ...(name === undefined ? {} : { name }),
      ...(typeof fn.arguments === "string" ? { argumentsDelta: fn.arguments } : {}),
      ...(extraContent === undefined ? {} : { extraContent }),
    });
  }
  return deltas;
};

const parseStreamChunk = (
  raw: unknown,
  indexState: StreamToolCallIndexState,
): ChatChunk | undefined => {
  const root = asRecord(raw);
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const choice = asRecord(choices[0]);
  const delta = asRecord(choice.delta);

  const contentDelta =
    typeof delta.content === "string" && delta.content !== "" ? delta.content : undefined;
  const toolCallDeltas = parseToolCallDeltas(delta.tool_calls, indexState);
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
    const root = Array.isArray(parsed) ? asRecord(parsed[0]) : asRecord(parsed);
    const error = asRecord(root.error);
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
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > MAX_STREAM_BYTES) {
        throw new LlmError(`respuesta de streaming supera el máximo de ${MAX_STREAM_BYTES} bytes`);
      }
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      assertWithinBytes(buffer, MAX_EVENT_BYTES, "evento SSE sin separador");
      for (const event of events) {
        assertWithinBytes(event, MAX_EVENT_BYTES, "evento SSE");
        for (const data of dataLines(event)) {
          if (data === "[DONE]") {
            return;
          }
          yield data;
        }
      }
    }
    assertWithinBytes(buffer, MAX_EVENT_BYTES, "evento SSE");
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
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const defaultSessionId = randomUUID();

  const send = async (
    resolved: ResolvedRoleModel,
    path: string,
    body: Record<string, unknown>,
    sessionId?: string,
  ): Promise<RequestSession> => {
    assertSecureBaseUrl(resolved.providerId, resolved.baseUrl);

    const apiKey = env[resolved.apiKeyEnv];
    if (apiKey === undefined || apiKey === "") {
      throw new LlmError(
        `falta la variable de entorno "${resolved.apiKeyEnv}" con la clave del proveedor "${resolved.providerId}" (BYOK)`,
      );
    }

    const url = joinUrl(resolved.baseUrl, path);
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      Math.max(0, timeoutMs),
    );
    const finish = (): void => {
      clearTimeout(timer);
    };

    let response: Response;
    try {
      response = await fetchFn(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          "user-agent": "migite/0.1.0",
          "x-opencode-session": sessionId ?? defaultSessionId,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (cause) {
      finish();
      if (timedOut) {
        throw timeoutError(resolved.providerId, url, timeoutMs);
      }
      throw new LlmError(
        `no se pudo contactar con el proveedor "${resolved.providerId}" en ${url}`,
        {
          cause,
        },
      );
    }

    if (!response.ok) {
      try {
        throw await toHttpError(response, url, apiKey);
      } finally {
        finish();
      }
    }

    return {
      response,
      url,
      apiKey,
      providerId: resolved.providerId,
      timedOut: () => timedOut,
      finish,
      cancel: () => {
        finish();
        controller.abort();
      },
    };
  };

  const readJson = async (response: Response, url: string): Promise<unknown> => {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new LlmError(`respuesta no JSON del proveedor en ${url}`);
    }
  };

  const timeoutOf = (session: RequestSession): LlmError =>
    timeoutError(session.providerId, session.url, timeoutMs);

  return {
    async chat(role: LLMRole, request: ChatRequest): Promise<ChatResponse> {
      const resolved = resolveRoleModel(llmConfig, role);
      const session = await send(
        resolved,
        "/chat/completions",
        buildChatBody(resolved.model, request, false),
        request.sessionId,
      );
      try {
        return parseChatResponse(await readJson(session.response, session.url));
      } catch (error) {
        if (session.timedOut()) {
          throw timeoutOf(session);
        }
        throw error;
      } finally {
        session.finish();
      }
    },

    async *chatStream(role: LLMRole, request: ChatRequest): AsyncIterable<ChatChunk> {
      const resolved = resolveRoleModel(llmConfig, role);
      const session = await send(
        resolved,
        "/chat/completions",
        buildChatBody(resolved.model, request, true),
        request.sessionId,
      );
      if (session.response.body === null) {
        session.finish();
        throw new LlmError(`el proveedor no devolvió un cuerpo de streaming en ${session.url}`);
      }

      const indexState = createStreamToolCallIndexState();
      try {
        for await (const data of readSseEvents(session.response.body)) {
          let raw: unknown;
          try {
            raw = JSON.parse(data);
          } catch {
            throw new LlmError(
              `evento SSE con JSON inválido del proveedor en ${session.url}: ${redact(data.slice(0, 200), session.apiKey)}`,
            );
          }
          const chunk = parseStreamChunk(raw, indexState);
          if (chunk !== undefined) {
            yield chunk;
          }
        }
      } catch (error) {
        if (session.timedOut()) {
          throw timeoutOf(session);
        }
        throw error;
      } finally {
        session.cancel();
      }
    },

    async embed(role: LLMRole, texts: readonly string[]): Promise<number[][]> {
      const resolved = resolveRoleModel(llmConfig, role);
      const session = await send(resolved, "/embeddings", {
        model: resolved.model,
        input: [...texts],
      });
      try {
        return parseEmbeddings(await readJson(session.response, session.url));
      } catch (error) {
        if (session.timedOut()) {
          throw timeoutOf(session);
        }
        throw error;
      } finally {
        session.finish();
      }
    },
  };
};
