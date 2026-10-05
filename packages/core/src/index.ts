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
