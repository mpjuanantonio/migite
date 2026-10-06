import {
  defaultLocale,
  type Locale,
  type TranslationKey,
  type TranslationParams,
  t,
} from "../i18n/index.js";

export class ObjectOperationError extends Error {
  readonly key: TranslationKey;
  readonly params: TranslationParams;
  readonly problems: readonly string[];
  readonly missing: readonly string[];

  constructor(
    key: TranslationKey,
    params: TranslationParams = {},
    problems: readonly string[] = [],
    missing: readonly string[] = [],
    locale: Locale = defaultLocale,
  ) {
    super(t(key, params, locale));
    this.name = "ObjectOperationError";
    this.key = key;
    this.params = params;
    this.problems = problems;
    this.missing = missing;
  }
}
