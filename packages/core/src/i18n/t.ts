import { catalogs } from "./catalogs.js";
import type { TranslationKey } from "./en.js";
import { defaultLocale, type Locale } from "./locales.js";

export type TranslationParams = Readonly<Record<string, string | number>>;

const interpolate = (template: string, params?: TranslationParams): string => {
  if (params === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
};

export const t = (
  key: TranslationKey,
  params?: TranslationParams,
  locale: Locale = defaultLocale,
): string => {
  const template = catalogs[locale]?.[key] ?? catalogs[defaultLocale]?.[key] ?? key;
  return interpolate(template, params);
};
