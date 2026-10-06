import type { Document, YAMLError } from "yaml";
import { isMap, isScalar, parseDocument } from "yaml";
import { defaultLocale, type Locale, t } from "../i18n/index.js";

export type FrontmatterDocument = {
  document: Document.Parsed;
  keys: string[];
  values: Record<string, unknown>;
};

export type FrontmatterRead =
  | { ok: true; source: FrontmatterDocument }
  | { ok: false; problems: string[] };

const yamlProblem = (error: YAMLError, locale: Locale): string => {
  const position = error.linePos?.[0];
  return position === undefined
    ? t("error.invalidYamlSyntaxCode", { code: error.code }, locale)
    : t(
        "error.invalidYamlSyntaxAt",
        { code: error.code, line: position.line, column: position.col },
        locale,
      );
};

const parseFrontmatter = (yamlText: string, locale: Locale): FrontmatterRead => {
  const document = parseDocument(yamlText);
  if (document.errors.length > 0) {
    return { ok: false, problems: document.errors.map((error) => yamlProblem(error, locale)) };
  }
  const contents = document.contents;
  if (contents !== null && !isMap(contents)) {
    return { ok: false, problems: ["frontmatter must be a YAML mapping"] };
  }
  const candidates: string[] = [];
  const keyProblems: string[] = [];
  if (contents !== null) {
    for (const pair of contents.items) {
      if (!isScalar(pair.key)) {
        keyProblems.push("frontmatter key must be a string");
        continue;
      }
      const key: unknown = pair.key.value;
      if (typeof key !== "string") {
        keyProblems.push(`frontmatter key "${String(key)}" must be a string`);
        continue;
      }
      candidates.push(key);
    }
  }
  if (keyProblems.length > 0) {
    return { ok: false, problems: keyProblems };
  }
  let values: Record<string, unknown>;
  try {
    const resolved: unknown = document.toJS();
    values =
      typeof resolved === "object" && resolved !== null && !Array.isArray(resolved)
        ? { ...resolved }
        : {};
  } catch {
    return { ok: false, problems: ["frontmatter could not be resolved"] };
  }
  const keys: string[] = [];
  const problems: string[] = [];
  for (const key of candidates) {
    if (!Object.hasOwn(values, key)) {
      problems.push(`frontmatter key "${key}" cannot be read`);
      continue;
    }
    keys.push(key);
  }
  if (problems.length > 0) {
    return { ok: false, problems };
  }
  return { ok: true, source: { document, keys, values } };
};

export const readFrontmatter = (
  yamlText: string,
  locale: Locale = defaultLocale,
): FrontmatterRead => {
  try {
    return parseFrontmatter(yamlText, locale);
  } catch {
    return { ok: false, problems: [t("error.invalidYamlSyntax", undefined, locale)] };
  }
};
