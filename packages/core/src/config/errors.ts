import { defaultLocale, type Locale, t } from "../i18n/index.js";

export class ConfigError extends Error {
  readonly path: string;
  readonly issues: readonly string[];

  constructor(path: string, issues: readonly string[], locale: Locale = defaultLocale) {
    super(`${t("error.configInvalida", { path }, locale)}: ${issues.join("; ")}`);
    this.name = "ConfigError";
    this.path = path;
    this.issues = issues;
  }
}
