import {
  defaultLocale,
  type Locale,
  type TranslationKey,
  type TranslationParams,
  t,
} from "../i18n/index.js";

export class TypeOperationError extends Error {
  readonly key: TranslationKey;
  readonly params: TranslationParams;
  readonly problems: readonly string[];

  constructor(
    key: TranslationKey,
    params: TranslationParams = {},
    problems: readonly string[] = [],
    locale: Locale = defaultLocale,
  ) {
    super(t(key, params, locale));
    this.name = "TypeOperationError";
    this.key = key;
    this.params = params;
    this.problems = problems;
  }
}
