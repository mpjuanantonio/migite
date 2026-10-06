import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse, YAMLParseError } from "yaml";
import type { ZodError } from "zod";
import { defaultLocale, type Locale, t } from "../i18n/index.js";
import { MAX_TEXT_FILE_BYTES } from "../limits.js";
import { type EnvEntry, envIssues, parseDotenv } from "./env.js";
import { ConfigError } from "./errors.js";
import { type AppConfig, type LlmConfig, makeAppSchema, makeLlmSchema } from "./schema.js";

export interface LoadConfigOptions {
  readonly root?: string;
  readonly locale?: Locale;
}

export interface Config {
  readonly app: AppConfig;
  readonly llm: LlmConfig;
  readonly envVars: readonly string[];
}

const formatIssues = (error: ZodError): readonly string[] =>
  error.issues.map((issue) => {
    const path = issue.path.map((segment) => String(segment)).join(".");
    return path === "" ? issue.message : `${path}: ${issue.message}`;
  });

const yamlErrorMessage = (error: unknown): string => {
  if (error instanceof YAMLParseError) {
    const position = error.linePos?.[0];
    return position === undefined
      ? t("error.invalidYamlSyntaxCode", { code: error.code })
      : t("error.invalidYamlSyntaxAt", {
          code: error.code,
          line: position.line,
          column: position.col,
        });
  }
  return t("error.invalidYamlSyntax");
};

const readYaml = (filePath: string, path: string, locale: Locale): unknown => {
  let source: string;
  try {
    const { size } = statSync(filePath);
    if (size > MAX_TEXT_FILE_BYTES) {
      throw new ConfigError(
        path,
        [t("error.fileTooLarge", { limit: MAX_TEXT_FILE_BYTES }, locale)],
        locale,
      );
    }
    source = readFileSync(filePath, "utf8");
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    throw new ConfigError(path, [t("error.configMissingFile")], locale);
  }
  try {
    return parse(source);
  } catch (error) {
    throw new ConfigError(path, [yamlErrorMessage(error)], locale);
  }
};

export const applyEnv = (
  entries: readonly EnvEntry[],
  target: NodeJS.ProcessEnv = process.env,
): void => {
  for (const entry of entries) {
    if (target[entry.name] === undefined) {
      target[entry.name] = entry.value;
    }
  }
};

const readEnv = (filePath: string, locale: Locale): readonly string[] => {
  let source: string;
  try {
    const { size } = statSync(filePath);
    if (size > MAX_TEXT_FILE_BYTES) {
      throw new ConfigError(
        ".env",
        [t("error.fileTooLarge", { limit: MAX_TEXT_FILE_BYTES }, locale)],
        locale,
      );
    }
    source = readFileSync(filePath, "utf8");
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    return [];
  }

  const { entries, issues } = parseDotenv(source);
  const problems = [...issues, ...envIssues(entries)];
  if (problems.length > 0) {
    throw new ConfigError(".env", problems, locale);
  }

  applyEnv(entries);
  return entries.map((entry) => entry.name);
};

export const loadConfig = (options: LoadConfigOptions = {}): Config => {
  const root = options.root ?? process.cwd();
  const locale = options.locale ?? defaultLocale;

  const app = makeAppSchema(locale).safeParse(
    readYaml(join(root, "config", "app.yaml"), "config/app.yaml", locale),
  );
  if (!app.success) {
    throw new ConfigError("config/app.yaml", formatIssues(app.error), locale);
  }

  const appLocale = app.data.locale;
  const llm = makeLlmSchema(appLocale).safeParse(
    readYaml(join(root, "config", "llm.yaml"), "config/llm.yaml", appLocale),
  );
  if (!llm.success) {
    throw new ConfigError("config/llm.yaml", formatIssues(llm.error), appLocale);
  }

  const envVars = readEnv(join(root, ".env"), appLocale);

  return { app: app.data, llm: llm.data, envVars };
};
