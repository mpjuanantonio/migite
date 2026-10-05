export const createId = (prefix?: string): string => {
  const id = crypto.randomUUID();
  return prefix === undefined ? id : `${prefix}_${id}`;
};

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
