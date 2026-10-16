export { LlmError } from "./errors.js";
export {
  type MockChatHandler,
  type MockChatStep,
  type MockEmbedHandler,
  type MockEmbedStep,
  type MockLLMCall,
  MockLLMClient,
  type MockLLMClientOptions,
} from "./mock.js";
export {
  createOpenAICompatClient,
  type FetchLike,
  type OpenAICompatDeps,
} from "./openai-compat.js";
export { type ResolvedRoleModel, resolveRoleModel } from "./roles.js";
export type {
  ChatChunk,
  ChatMessage,
  ChatMessageRole,
  ChatOptions,
  ChatRequest,
  ChatResponse,
  ChatResponseMessage,
  ChatUsage,
  FinishReason,
  JsonObject,
  JsonPrimitive,
  JsonSchema,
  JsonValue,
  LLMClient,
  LLMRole,
  ToolCall,
  ToolCallDelta,
  ToolChoice,
  ToolDefinition,
} from "./types.js";
