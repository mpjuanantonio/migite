import { DEFAULT_TYPE, isReservedKey, REQUIRED_KEYS } from "./keys.js";
import { readFrontmatter } from "./read.js";
import { splitObjectFile, splitProblem } from "./split.js";
import type { ObjectFrontmatter, ParsedObjectFile } from "./types.js";
import { asString, asStringList, readOwn, writeOwn } from "./values.js";

type FrontmatterBuild =
  | { ok: true; frontmatter: ObjectFrontmatter }
  | { ok: false; problems: string[] };

type RequiredKey = (typeof REQUIRED_KEYS)[number];

const readRequiredString = (
  values: Record<string, unknown>,
  key: string,
  problems: string[],
): string | undefined => {
  const raw = readOwn(values, key);
  if (raw === undefined || raw === null) {
    problems.push(`missing required key "${key}"`);
    return undefined;
  }
  const value = asString(raw);
  if (value === undefined) {
    problems.push(`key "${key}" must be a string`);
    return undefined;
  }
  return value;
};

const buildFrontmatter = (keys: string[], values: Record<string, unknown>): FrontmatterBuild => {
  const problems: string[] = [];
  const attributes: Record<string, unknown> = {};
  for (const key of keys) {
    if (!isReservedKey(key)) {
      writeOwn(attributes, key, readOwn(values, key));
    }
  }
  const required: Partial<Record<RequiredKey, string>> = {};
  for (const key of REQUIRED_KEYS) {
    const value = readRequiredString(values, key, problems);
    if (value !== undefined) {
      required[key] = value;
    }
  }
  const rawType = readOwn(values, "tipo");
  let type: string | undefined;
  if (rawType !== undefined && rawType !== null) {
    type = asString(rawType);
    if (type === undefined) {
      problems.push('key "tipo" must be a string');
    }
  }
  const rawLinks = readOwn(values, "enlaces");
  let links: string[] = [];
  if (rawLinks !== undefined && rawLinks !== null) {
    const parsedLinks = asStringList(rawLinks);
    if (parsedLinks === undefined) {
      problems.push('key "enlaces" must be a list of strings');
    } else {
      links = parsedLinks;
    }
  }
  const { id, titulo, creado, actualizado } = required;
  if (
    problems.length > 0 ||
    id === undefined ||
    titulo === undefined ||
    creado === undefined ||
    actualizado === undefined
  ) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    frontmatter: {
      id,
      type: type ?? DEFAULT_TYPE,
      title: titulo,
      created: creado,
      updated: actualizado,
      links,
      attributes,
    },
  };
};

export const parseObjectFile = (text: string): ParsedObjectFile => {
  const split = splitObjectFile(text);
  if (split.kind !== "ok") {
    return { ok: false, problems: [splitProblem(split.kind)], raw: { yamlText: "", body: text } };
  }
  const raw = { yamlText: split.yamlText, body: split.body };
  const read = readFrontmatter(split.yamlText);
  if (!read.ok) {
    return { ok: false, problems: read.problems, raw };
  }
  const built = buildFrontmatter(read.source.keys, read.source.values);
  if (!built.ok) {
    return { ok: false, problems: built.problems, raw };
  }
  return { ok: true, frontmatter: built.frontmatter, body: split.body };
};
