import type { LlmRole } from "@migite/core";

export type LLMRole = LlmRole;

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type JsonSchema = JsonObject;

export type ChatMessageRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
  readonly extraContent?: Record<string, unknown>;
}

export interface ChatMessage {
  readonly role: ChatMessageRole;
  readonly content: string;
  readonly toolCallId?: string;
  readonly name?: string;
  readonly toolCalls?: readonly ToolCall[];
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonSchema;
}

export type ToolChoice = "auto" | "none" | "required" | { readonly name: string };

export interface ChatOptions {
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly topP?: number;
  readonly stop?: readonly string[];
}

export interface ChatRequest {
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly ToolDefinition[];
  readonly toolChoice?: ToolChoice;
  readonly options?: ChatOptions;
  readonly sessionId?: string;
}

export type FinishReason = "stop" | "length" | "tool_calls" | "content_filter";

export interface ChatUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface ChatResponseMessage {
  readonly content: string;
  readonly toolCalls: readonly ToolCall[];
}

export interface ChatResponse {
  readonly message: ChatResponseMessage;
  readonly finishReason: FinishReason;
  readonly usage?: ChatUsage;
}

export interface ToolCallDelta {
  readonly index: number;
  readonly id?: string;
  readonly name?: string;
  readonly argumentsDelta?: string;
  readonly extraContent?: Record<string, unknown>;
}

export interface ChatChunk {
  readonly contentDelta?: string;
  readonly toolCallDeltas?: readonly ToolCallDelta[];
  readonly finishReason?: FinishReason;
  readonly usage?: ChatUsage;
}

export interface LLMClient {
  chat(role: LLMRole, request: ChatRequest): Promise<ChatResponse>;
  chatStream(role: LLMRole, request: ChatRequest): AsyncIterable<ChatChunk>;
  embed(role: LLMRole, texts: readonly string[]): Promise<number[][]>;
}
