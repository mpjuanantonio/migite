export { describeError, LlmError } from "./errors.js";
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
export { type BuildSystemPromptOptions, buildSystemPrompt } from "./prompt.js";
export { type ResolvedRoleModel, resolveRoleModel } from "./roles.js";
export {
  type AgentEvent,
  type AgentLimits,
  type AgentRunRequest,
  type AgentRunResult,
  type AgentRunState,
  type AgentRuntime,
  type AgentRuntimeOptions,
  createAgentRuntime,
  DEFAULT_AGENT_LIMITS,
} from "./runtime.js";
export {
  type ToolExecution,
  type ToolHandlerResult,
  ToolRegistry,
  type ToolSpec,
} from "./tools.js";
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
