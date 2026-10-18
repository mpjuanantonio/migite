import { describeError } from "./errors.js";
import { envolverDatosVault } from "./prompt.js";
import type { ToolRegistry } from "./tools.js";
import type {
  ChatChunk,
  ChatMessage,
  ChatOptions,
  ChatRequest,
  ChatResponse,
  ChatUsage,
  FinishReason,
  LLMClient,
  LLMRole,
  ToolCall,
  ToolCallDelta,
} from "./types.js";

export const DEFAULT_AGENT_LIMITS = {
  maxSteps: 8,
  maxToolResultChars: 4000,
  timeoutMs: 60_000,
} as const;

export interface AgentLimits {
  readonly maxSteps?: number;
  readonly maxToolResultChars?: number;
  readonly timeoutMs?: number;
}

export interface AgentRunRequest {
  readonly role?: LLMRole;
  readonly systemPrompt?: string;
  readonly history: readonly ChatMessage[];
  readonly userMessage: string;
  readonly options?: ChatOptions;
}

export type AgentEvent =
  | { readonly type: "toolStart"; readonly toolCallId: string; readonly name: string }
  | {
      readonly type: "toolEnd";
      readonly toolCallId: string;
      readonly name: string;
      readonly isError: boolean;
    };

export type AgentDeltaEvent = {
  readonly type: "delta";
  readonly texto: string;
};

export type AgentStreamEvent = AgentEvent | AgentDeltaEvent;

export type AgentRunState = "completado" | "limite" | "error";

export interface AgentRunResult {
  readonly content: string;
  readonly toolCallsEjecutados: readonly ToolCall[];
  readonly steps: number;
  readonly finishReason: FinishReason | undefined;
  readonly usage?: ChatUsage;
  readonly estado: AgentRunState;
  readonly error?: string;
  readonly events: readonly AgentEvent[];
}

export interface AgentRuntimeOptions {
  readonly client: LLMClient;
  readonly registry: ToolRegistry;
  readonly limits?: AgentLimits;
}

export interface AgentRuntime {
  run(request: AgentRunRequest): Promise<AgentRunResult>;
  runStream(request: AgentRunRequest): AsyncGenerator<AgentStreamEvent, AgentRunResult>;
}

type DeadlineOutcome<T> =
  | { readonly expired: true }
  | { readonly expired: false; readonly value: T };

const withDeadline = async <T>(promise: Promise<T>, ms: number): Promise<DeadlineOutcome<T>> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then((value) => ({ expired: false as const, value })),
      new Promise<{ expired: true }>((resolve) => {
        timer = setTimeout(() => resolve({ expired: true }), Math.max(0, ms));
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};

const addUsage = (
  current: ChatUsage | undefined,
  next: ChatUsage | undefined,
): ChatUsage | undefined => {
  if (next === undefined) {
    return current;
  }
  if (current === undefined) {
    return next;
  }
  return {
    promptTokens: current.promptTokens + next.promptTokens,
    completionTokens: current.completionTokens + next.completionTokens,
    totalTokens: current.totalTokens + next.totalTokens,
  };
};

const truncate = (text: string, limit: number): string => {
  const safeLimit = Math.max(0, Math.trunc(limit));
  if (text.length <= safeLimit) {
    return text;
  }
  const omitted = text.length - safeLimit;
  return `${text.slice(0, safeLimit)}…[truncado: ${omitted} caracteres omitidos]`;
};

const unirContenido = (acumulado: string, nuevo: string): string => {
  if (nuevo === "") {
    return acumulado;
  }
  if (acumulado === "") {
    return nuevo;
  }
  return `${acumulado}\n\n${nuevo}`;
};

const esResultadoEstructurado = (content: string): boolean => {
  try {
    const parsed: unknown = JSON.parse(content);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
};

// Punto único: el texto libre de una herramienta se marca como datos del usuario; los
// resultados JSON ya delimitan sus propios campos de usuario (ver herramientas de lectura).
const contenidoDeHerramienta = (content: string): string =>
  esResultadoEstructurado(content) ? content : envolverDatosVault(content);

const timeoutMessage = (timeoutMs: number): string =>
  `tiempo de espera agotado (timeoutMs=${timeoutMs})`;

type TurnOutcome =
  | { readonly tipo: "ok"; readonly value: ChatResponse }
  | { readonly tipo: "limite"; readonly contenido: string }
  | { readonly tipo: "error"; readonly contenido: string; readonly error: unknown };

type StreamTurn = (
  request: ChatRequest,
  deadlineAt: number,
) => AsyncGenerator<AgentDeltaEvent, TurnOutcome>;

const chatOutcome = async (
  client: LLMClient,
  role: LLMRole,
  request: ChatRequest,
  deadlineAt: number,
): Promise<TurnOutcome> => {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) {
    return { tipo: "limite", contenido: "" };
  }
  const outcome = await withDeadline(client.chat(role, request), remaining);
  return outcome.expired ? { tipo: "limite", contenido: "" } : { tipo: "ok", value: outcome.value };
};

type PartialToolCall = {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
};

const mergeToolCallDelta = (current: PartialToolCall, delta: ToolCallDelta): PartialToolCall => ({
  id: delta.id ?? current.id,
  name: delta.name ?? current.name,
  arguments: current.arguments + (delta.argumentsDelta ?? ""),
});

const parseToolArguments = (raw: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const closeIterator = (iterator: AsyncIterator<ChatChunk>): void => {
  const result = iterator.return?.();
  if (result !== undefined) {
    void result.catch(() => undefined);
  }
};

const accumulateStream = async function* (
  iterator: AsyncIterator<ChatChunk>,
  deadlineAt: number,
): AsyncGenerator<AgentDeltaEvent, TurnOutcome> {
  let content = "";
  let finishReason: FinishReason | undefined;
  let usage: ChatUsage | undefined;
  const pending = new Map<number, PartialToolCall>();

  try {
    while (true) {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) {
        closeIterator(iterator);
        return { tipo: "limite", contenido: content };
      }

      const outcome = await withDeadline(iterator.next(), remaining);
      if (outcome.expired) {
        closeIterator(iterator);
        return { tipo: "limite", contenido: content };
      }
      if (outcome.value.done) {
        break;
      }

      const chunk = outcome.value.value;
      if (chunk.contentDelta !== undefined && chunk.contentDelta !== "") {
        content += chunk.contentDelta;
        yield { type: "delta", texto: chunk.contentDelta };
      }
      for (const delta of chunk.toolCallDeltas ?? []) {
        const current = pending.get(delta.index) ?? { id: "", name: "", arguments: "" };
        pending.set(delta.index, mergeToolCallDelta(current, delta));
      }
      if (chunk.finishReason !== undefined) {
        finishReason = chunk.finishReason;
      }
      if (chunk.usage !== undefined) {
        usage = chunk.usage;
      }
    }
  } catch (error) {
    closeIterator(iterator);
    return { tipo: "error", contenido: content, error };
  }

  const toolCalls: ToolCall[] = [...pending.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, call]) => ({
      id: call.id,
      name: call.name,
      arguments: parseToolArguments(call.arguments),
    }));

  return {
    tipo: "ok",
    value: {
      message: { content, toolCalls },
      finishReason: finishReason ?? "stop",
      ...(usage === undefined ? {} : { usage }),
    },
  };
};

const createStreamTurn = (client: LLMClient, role: LLMRole): StreamTurn =>
  async function* streamTurn(request: ChatRequest, deadlineAt: number) {
    const iterator = client.chatStream(role, request)[Symbol.asyncIterator]();
    return yield* accumulateStream(iterator, deadlineAt);
  };

type AgentLoop = (request: AgentRunRequest) => AsyncGenerator<AgentStreamEvent, AgentRunResult>;

const createAgentLoop = (options: AgentRuntimeOptions, streaming: boolean): AgentLoop => {
  const maxSteps = options.limits?.maxSteps ?? DEFAULT_AGENT_LIMITS.maxSteps;
  const maxToolResultChars =
    options.limits?.maxToolResultChars ?? DEFAULT_AGENT_LIMITS.maxToolResultChars;
  const timeoutMs = options.limits?.timeoutMs ?? DEFAULT_AGENT_LIMITS.timeoutMs;

  return async function* agentLoop(
    request: AgentRunRequest,
  ): AsyncGenerator<AgentStreamEvent, AgentRunResult> {
    const role = request.role ?? "chat";
    const events: AgentEvent[] = [];
    const executed: ToolCall[] = [];
    const messages: ChatMessage[] = [
      ...(request.systemPrompt === undefined || request.systemPrompt === ""
        ? []
        : [{ role: "system" as const, content: request.systemPrompt }]),
      ...request.history,
      { role: "user", content: request.userMessage },
    ];
    const definitions = options.registry.definitions();
    const deadline = Date.now() + timeoutMs;

    let content = "";
    let finishReason: FinishReason | undefined;
    let usage: ChatUsage | undefined;
    let steps = 0;

    const finish = (estado: AgentRunState, error?: string): AgentRunResult => ({
      content,
      toolCallsEjecutados: [...executed],
      steps,
      finishReason,
      ...(usage === undefined ? {} : { usage }),
      estado,
      ...(error === undefined ? {} : { error }),
      events: [...events],
    });

    for (let step = 0; step < maxSteps; step += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return finish("limite", timeoutMessage(timeoutMs));
      }

      steps += 1;
      const chatRequest: ChatRequest = {
        messages: [...messages],
        ...(definitions.length === 0 ? {} : { tools: definitions }),
        ...(request.options === undefined ? {} : { options: request.options }),
      };
      let outcome: TurnOutcome;
      try {
        if (streaming) {
          outcome = yield* createStreamTurn(options.client, role)(chatRequest, deadline);
        } else {
          outcome = await chatOutcome(options.client, role, chatRequest, deadline);
        }
      } catch (error) {
        return finish("error", describeError(error));
      }

      if (outcome.tipo === "limite") {
        content = unirContenido(content, outcome.contenido);
        return finish("limite", timeoutMessage(timeoutMs));
      }
      if (outcome.tipo === "error") {
        content = unirContenido(content, outcome.contenido);
        return finish("error", describeError(outcome.error));
      }

      const response = outcome.value;
      finishReason = response.finishReason;
      usage = addUsage(usage, response.usage);
      content = unirContenido(content, response.message.content);

      if (response.message.toolCalls.length === 0) {
        return finish("completado");
      }

      messages.push({
        role: "assistant",
        content: response.message.content,
        toolCalls: response.message.toolCalls,
      });

      for (const toolCall of response.message.toolCalls) {
        const remainingForTool = deadline - Date.now();
        if (remainingForTool <= 0) {
          return finish("limite", timeoutMessage(timeoutMs));
        }

        const start: AgentEvent = {
          type: "toolStart",
          toolCallId: toolCall.id,
          name: toolCall.name,
        };
        events.push(start);
        yield start;

        const toolOutcome = await withDeadline(
          options.registry.execute(toolCall),
          remainingForTool,
        );
        if (toolOutcome.expired) {
          return finish("limite", timeoutMessage(timeoutMs));
        }

        const execution = toolOutcome.value;
        executed.push(toolCall);
        const end: AgentEvent = {
          type: "toolEnd",
          toolCallId: toolCall.id,
          name: toolCall.name,
          isError: execution.isError,
        };
        events.push(end);
        yield end;
        messages.push({
          role: "tool",
          content: contenidoDeHerramienta(truncate(execution.content, maxToolResultChars)),
          toolCallId: toolCall.id,
          name: toolCall.name,
        });
      }
    }

    return finish("limite", `se alcanzó el máximo de pasos (maxSteps=${maxSteps})`);
  };
};

export const createAgentRuntime = (options: AgentRuntimeOptions): AgentRuntime => {
  const runLoop = createAgentLoop(options, false);
  const streamLoop = createAgentLoop(options, true);

  return {
    async run(request: AgentRunRequest): Promise<AgentRunResult> {
      const iterator = runLoop(request);
      let step = await iterator.next();
      while (!step.done) {
        step = await iterator.next();
      }
      return step.value;
    },

    runStream(request: AgentRunRequest): AsyncGenerator<AgentStreamEvent, AgentRunResult> {
      return streamLoop(request);
    },
  };
};
