import { t } from "../i18n/index.js";
import { ENV_VAR_PATTERN } from "./schema.js";

export interface EnvEntry {
  readonly name: string;
  readonly value: string;
  readonly line: number;
}

export interface ParsedEnv {
  readonly entries: readonly EnvEntry[];
  readonly issues: readonly string[];
}

const PORT_PATTERN = /^\d+$/;
const QUOTED_VALUE = /^(['"])(.*)\1$/;

const stripComment = (value: string): string => {
  const cut = value.search(/\s#/);
  return (cut === -1 ? value : value.slice(0, cut)).trim();
};

export const parseDotenv = (source: string): ParsedEnv => {
  const entries: EnvEntry[] = [];
  const issues: string[] = [];
  const lines = source.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const number = index + 1;
    const text = line.trim();
    if (text === "" || text.startsWith("#")) {
      continue;
    }
    const separator = text.indexOf("=");
    if (separator === -1) {
      issues.push(t("error.envMissingEquals", { line: number }));
      continue;
    }
    const name = text.slice(0, separator).trim();
    if (!ENV_VAR_PATTERN.test(name)) {
      issues.push(t("error.envInvalidName", { line: number }));
      continue;
    }
    const raw = text.slice(separator + 1);
    const quoted = QUOTED_VALUE.exec(raw.trim());
    const value = quoted === null ? stripComment(raw) : (quoted[2] ?? "");
    entries.push({ name, value, line: number });
  }

  return { entries, issues };
};

export const envIssues = (entries: readonly EnvEntry[]): readonly string[] => {
  const port = entries.find((entry) => entry.name === "PORT");
  if (port === undefined) {
    return [];
  }
  const value = Number(port.value);
  const valid =
    PORT_PATTERN.test(port.value) && Number.isInteger(value) && value >= 1 && value <= 65535;
  return valid ? [] : [t("error.envInvalidPort", { line: port.line })];
};
