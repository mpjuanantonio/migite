export { bootstrapVault } from "./bootstrap.js";
export { ObjectOperationError } from "./errors.js";
export type {
  CreateObjectInput,
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
export { RESERVED_ROOT_DIRS } from "./vault.js";
