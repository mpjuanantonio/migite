import { LlmError } from "./errors.js";
import type { ChatChunk, ChatRequest, ChatResponse, LLMClient, LLMRole } from "./types.js";

export type MockChatHandler = (request: ChatRequest) => ChatResponse | Promise<ChatResponse>;

export type MockChatStep = ChatResponse | Error | MockChatHandler;

export type MockEmbedHandler = (
  texts: readonly string[],
) => readonly (readonly number[])[] | Promise<readonly (readonly number[])[]>;

export type MockEmbedStep = readonly (readonly number[])[] | Error | MockEmbedHandler;

export interface MockLLMClientOptions {
  readonly responses?: readonly MockChatStep[];
  readonly embeddings?: readonly MockEmbedStep[];
}

export type MockLLMCall =
  | { readonly method: "chat"; readonly role: LLMRole; readonly request: ChatRequest }
  | { readonly method: "chatStream"; readonly role: LLMRole; readonly request: ChatRequest }
  | { readonly method: "embed"; readonly role: LLMRole; readonly texts: readonly string[] };

export class MockLLMClient implements LLMClient {
  readonly calls: MockLLMCall[] = [];

  private readonly responses: MockChatStep[];
  private readonly embeddings: MockEmbedStep[];
  private responseIndex = 0;
  private embeddingIndex = 0;

  constructor(options: MockLLMClientOptions = {}) {
    this.responses = [...(options.responses ?? [])];
    this.embeddings = [...(options.embeddings ?? [])];
  }

  async chat(role: LLMRole, request: ChatRequest): Promise<ChatResponse> {
    this.calls.push({ method: "chat", role, request });
    return this.nextResponse("chat", request);
  }

  async *chatStream(role: LLMRole, request: ChatRequest): AsyncIterable<ChatChunk> {
    this.calls.push({ method: "chatStream", role, request });
    const response = await this.nextResponse("chatStream", request);

    if (response.message.content !== "") {
      yield { contentDelta: response.message.content };
    }

    for (const [index, toolCall] of response.message.toolCalls.entries()) {
      yield {
        toolCallDeltas: [
          {
            index,
            id: toolCall.id,
            name: toolCall.name,
            argumentsDelta: JSON.stringify(toolCall.arguments),
            ...(toolCall.extraContent === undefined ? {} : { extraContent: toolCall.extraContent }),
          },
        ],
      };
    }

    yield response.usage === undefined
      ? { finishReason: response.finishReason }
      : { finishReason: response.finishReason, usage: response.usage };
  }

  async embed(role: LLMRole, texts: readonly string[]): Promise<number[][]> {
    this.calls.push({ method: "embed", role, texts });
    const step = this.nextStep(this.embeddings, this.embeddingIndex, "embeddings");
    this.embeddingIndex += 1;

    if (step instanceof Error) {
      throw step;
    }

    const vectors = typeof step === "function" ? await step(texts) : step;
    return vectors.map((vector) => [...vector]);
  }

  private nextStep<T>(steps: readonly T[], index: number, scriptName: string): T {
    const step = steps[index];
    if (step === undefined) {
      throw new LlmError(
        `el guion de ${scriptName} del MockLLMClient no tiene más entradas (llamada ${index + 1})`,
      );
    }
    return step;
  }

  private async nextResponse(scriptName: string, request: ChatRequest): Promise<ChatResponse> {
    const step = this.nextStep(this.responses, this.responseIndex, scriptName);
    this.responseIndex += 1;

    if (step instanceof Error) {
      throw step;
    }

    return typeof step === "function" ? await step(request) : step;
  }
}
