export const createId = (prefix?: string): string => {
  const id = crypto.randomUUID();
  return prefix === undefined ? id : `${prefix}_${id}`;
};

export {
  type AppConfig,
  type Config,
  ConfigError,
  type LlmConfig,
  type LlmRole,
  type LoadConfigOptions,
  loadConfig,
  missingApiKeys,
  type Provider,
  ROLES,
  type RoleAssignment,
} from "./config/index.js";

export {
  type Catalog,
  type Catalogs,
  catalogs,
  checkCatalogs,
  defaultLocale,
  en,
  es,
  type Locale,
  locales,
  type TranslationKey,
  type TranslationParams,
  t,
} from "./i18n/index.js";

export { NATIVE_TYPE_IDS, seedNativeTypes } from "./native-types/index.js";

export {
  ATTRIBUTE_ROLE_WIRES,
  type AttributeDefinition,
  type AttributeRole,
  FIELD_TYPE_WIRES,
  type FieldType,
  isReservedTypeId,
  loadTypeRegistry,
  parseTypeYaml,
  type TypeDefinition,
  type TypeWarning,
  WIRE_TO_ATTRIBUTE_ROLE,
  WIRE_TO_FIELD_TYPE,
} from "./types/index.js";
