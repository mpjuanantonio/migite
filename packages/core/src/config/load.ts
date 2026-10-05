import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, YAMLParseError } from "yaml";
import type { ZodError } from "zod";
import { defaultLocale, type Locale } from "../i18n/index.js";
import { type EnvEntry, parseDotenv, problemasDeEnv } from "./env.js";
import { ConfigError } from "./errors.js";
import { type AppConfig, appSchema, type LlmConfig, llmSchema } from "./schema.js";

export interface LoadConfigOptions {
  readonly root?: string;
  readonly locale?: Locale;
}

export interface Config {
  readonly app: AppConfig;
  readonly llm: LlmConfig;
  readonly envVars: readonly string[];
}

const formatearIssues = (error: ZodError): readonly string[] =>
  error.issues.map((issue) => {
    const path = issue.path.map((segment) => String(segment)).join(".");
    return path === "" ? issue.message : `${path}: ${issue.message}`;
  });

const mensajeDeYaml = (error: unknown): string => {
  if (error instanceof YAMLParseError) {
    const posicion = error.linePos?.[0];
    const lugar = posicion === undefined ? "" : `, línea ${posicion.line}, columna ${posicion.col}`;
    return `sintaxis YAML inválida (${error.code}${lugar})`;
  }
  return "sintaxis YAML inválida";
};

const leerYaml = (ruta: string, path: string, locale: Locale): unknown => {
  let source: string;
  try {
    source = readFileSync(ruta, "utf8");
  } catch {
    throw new ConfigError(path, ["fichero ausente o ilegible"], locale);
  }
  try {
    return parse(source);
  } catch (error) {
    throw new ConfigError(path, [mensajeDeYaml(error)], locale);
  }
};

const aplicarEnv = (entries: readonly EnvEntry[]): void => {
  for (const entry of entries) {
    if (process.env[entry.name] === undefined) {
      process.env[entry.name] = entry.value;
    }
  }
};

const leerEnv = (ruta: string, locale: Locale): readonly string[] => {
  let source: string;
  try {
    source = readFileSync(ruta, "utf8");
  } catch {
    return [];
  }

  const { entries, issues } = parseDotenv(source);
  const problemas = [...issues, ...problemasDeEnv(entries)];
  if (problemas.length > 0) {
    throw new ConfigError(".env", problemas, locale);
  }

  aplicarEnv(entries);
  return entries.map((entry) => entry.name);
};

export const loadConfig = (options: LoadConfigOptions = {}): Config => {
  const root = options.root ?? process.cwd();
  const locale = options.locale ?? defaultLocale;

  const app = appSchema.safeParse(
    leerYaml(join(root, "config", "app.yaml"), "config/app.yaml", locale),
  );
  if (!app.success) {
    throw new ConfigError("config/app.yaml", formatearIssues(app.error), locale);
  }

  const idioma = app.data.idioma;
  const llm = llmSchema.safeParse(
    leerYaml(join(root, "config", "llm.yaml"), "config/llm.yaml", idioma),
  );
  if (!llm.success) {
    throw new ConfigError("config/llm.yaml", formatearIssues(llm.error), idioma);
  }

  const envVars = leerEnv(join(root, ".env"), idioma);

  return { app: app.data, llm: llm.data, envVars };
};
