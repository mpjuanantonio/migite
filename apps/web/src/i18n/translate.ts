import {
  t as coreT,
  defaultLocale,
  type Locale,
  type TranslationKey,
  type TranslationParams,
} from "@migite/core";
import { type WebTranslationKey, webCatalogs } from "./catalogs";

export type AppTranslationKey = TranslationKey | WebTranslationKey;

const isWebKey = (key: AppTranslationKey): key is WebTranslationKey =>
  Object.hasOwn(webCatalogs.es, key);

const interpolate = (template: string, params?: TranslationParams): string => {
  if (params === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    return value === undefined ? `{${name}}` : String(value);
  });
};

export const translate = (
  key: AppTranslationKey,
  params?: TranslationParams,
  locale: Locale = defaultLocale,
): string => {
  if (!isWebKey(key)) {
    return coreT(key, params, locale);
  }
  const template = webCatalogs[locale][key] ?? webCatalogs[defaultLocale][key];
  if (template === undefined) {
    return key;
  }
  return interpolate(template, params);
};
