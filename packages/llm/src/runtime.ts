import { describeError } from "./errors.js";
import type { ToolRegistry } from "./tools.js";
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatUsage,
  FinishReason,
  LLMClient,
  LLMRole,
  ToolCall,
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

const timeoutMessage = (timeoutMs: number): string =>
  `tiempo de espera agotado (timeoutMs=${timeoutMs})`;

export const createAgentRuntime = (options: AgentRuntimeOptions): AgentRuntime => {
  const maxSteps = options.limits?.maxSteps ?? DEFAULT_AGENT_LIMITS.maxSteps;
  const maxToolResultChars =
    options.limits?.maxToolResultChars ?? DEFAULT_AGENT_LIMITS.maxToolResultChars;
  const timeoutMs = options.limits?.timeoutMs ?? DEFAULT_AGENT_LIMITS.timeoutMs;

  return {
    async run(request: AgentRunRequest): Promise<AgentRunResult> {
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
        let outcome: DeadlineOutcome<ChatResponse>;
        try {
          outcome = await withDeadline(
            options.client.chat(role, {
              messages: [...messages],
              ...(definitions.length === 0 ? {} : { tools: definitions }),
              ...(request.options === undefined ? {} : { options: request.options }),
            }),
            remaining,
          );
        } catch (error) {
          return finish("error", describeError(error));
        }

        if (outcome.expired) {
          return finish("limite", timeoutMessage(timeoutMs));
        }

        const response = outcome.value;
        finishReason = response.finishReason;
        usage = addUsage(usage, response.usage);
        content = response.message.content;

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

          events.push({ type: "toolStart", toolCallId: toolCall.id, name: toolCall.name });
          const toolOutcome = await withDeadline(
            options.registry.execute(toolCall),
            remainingForTool,
          );
          if (toolOutcome.expired) {
            return finish("limite", timeoutMessage(timeoutMs));
          }

          const execution = toolOutcome.value;
          executed.push(toolCall);
          events.push({
            type: "toolEnd",
            toolCallId: toolCall.id,
            name: toolCall.name,
            isError: execution.isError,
          });
          messages.push({
            role: "tool",
            content: truncate(execution.content, maxToolResultChars),
            toolCallId: toolCall.id,
            name: toolCall.name,
          });
        }
      }

      return finish("limite", `se alcanzó el máximo de pasos (maxSteps=${maxSteps})`);
    },
  };
};
