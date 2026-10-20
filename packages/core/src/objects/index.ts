export { bootstrapVault } from "./bootstrap.js";
export {
  type ChunkMarkdownOptions,
  chunkMarkdownBySections,
  DEFAULT_CHUNK_MAX_CHARS,
  DEFAULT_CHUNK_OVERLAP_CHARS,
  type MarkdownChunk,
} from "./chunks.js";
export { ObjectOperationError } from "./errors.js";
export type {
  CreateObjectInput,
  DegradationReason,
  DegradedObjectView,
  DomainEvent,
  IncomingLink,
  ObjectRecord,
  ObjectRepository,
  ObjectSummary,
  ReadObjectResult,
  RenameReport,
  UpdateObjectChanges,
  VaultBootstrap,
} from "./model.js";
export { type CreateObjectRepositoryOptions, createObjectRepository } from "./repository.js";
export {
  type AttributeTray,
  addAttribute,
  createAttributeTray,
  removeAttribute,
  setAttribute,
} from "./tray.js";
export { MAX_OBJECT_BYTES, RESERVED_ROOT_DIRS } from "./vault.js";
