import { Document } from "yaml";
import { t } from "../i18n/index.js";
import { DEFAULT_TYPE, isReservedKey, RESERVED_KEYS, type ReservedKey } from "./keys.js";
import { type FrontmatterDocument, readFrontmatter } from "./read.js";
import { joinObjectFile, splitObjectFile, splitProblem } from "./split.js";
import type { ObjectFrontmatter } from "./types.js";
import { isEqual, readOwn } from "./values.js";

type WirePlan = {
  value: unknown;
  skipWhenAbsent: boolean;
  logical: unknown;
};

const planWire = (wire: ReservedKey, frontmatter: ObjectFrontmatter): WirePlan => {
  switch (wire) {
    case "id":
      return { value: frontmatter.id, skipWhenAbsent: false, logical: frontmatter.id };
    case "titulo":
      return { value: frontmatter.title, skipWhenAbsent: false, logical: frontmatter.title };
    case "creado":
      return { value: frontmatter.created, skipWhenAbsent: false, logical: frontmatter.created };
    case "actualizado":
      return { value: frontmatter.updated, skipWhenAbsent: false, logical: frontmatter.updated };
    case "tipo": {
      const type = frontmatter.type ?? DEFAULT_TYPE;
      return { value: frontmatter.type, skipWhenAbsent: type === DEFAULT_TYPE, logical: type };
    }
    case "enlaces":
      return {
        value: frontmatter.links,
        skipWhenAbsent: frontmatter.links.length === 0,
        logical: frontmatter.links,
      };
  }
};

const currentLogical = (wire: ReservedKey, raw: unknown): unknown => {
  switch (wire) {
    case "tipo":
      return raw ?? DEFAULT_TYPE;
    case "enlaces":
      return Array.isArray(raw) ? raw : [];
    default:
      return raw;
  }
};

const mergeReserved = (
  document: Document,
  hasBase: boolean,
  presentKeys: ReadonlySet<string>,
  values: Record<string, unknown>,
  frontmatter: ObjectFrontmatter,
): boolean => {
  let dirty = false;
  for (const wire of RESERVED_KEYS) {
    const plan = planWire(wire, frontmatter);
    if (presentKeys.has(wire)) {
      if (isEqual(currentLogical(wire, readOwn(values, wire)), plan.logical)) {
        continue;
      }
      if (plan.value === undefined) {
        if (wire === "tipo") {
          continue;
        }
        document.delete(wire);
      } else {
        document.set(wire, plan.value);
      }
    } else {
      if (plan.value === undefined || (hasBase && plan.skipWhenAbsent)) {
        continue;
      }
      document.set(wire, plan.value);
    }
    dirty = true;
  }
  return dirty;
};

const mergeAttributes = (
  document: Document,
  hasBase: boolean,
  presentKeys: ReadonlySet<string>,
  values: Record<string, unknown>,
  attributes: Record<string, unknown>,
): boolean => {
  let dirty = false;
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) {
      continue;
    }
    if (hasBase && presentKeys.has(key) && isEqual(readOwn(values, key), value)) {
      continue;
    }
    document.set(key, value);
    dirty = true;
  }
  if (hasBase) {
    for (const key of presentKeys) {
      if (isReservedKey(key) || readOwn(attributes, key) !== undefined) {
        continue;
      }
      document.delete(key);
      dirty = true;
    }
  }
  return dirty;
};

const assertAttributes = (attributes: Record<string, unknown>): void => {
  for (const key of Object.keys(attributes)) {
    if (isReservedKey(key)) {
      throw new Error(t("error.reservedAttributeKey", { key }));
    }
  }
};

const stringifySection = (document: Document, eol: string): string => {
  const text = document.toString({ lineWidth: 0 });
  return eol === "\r\n" ? text.replace(/\r?\n/g, "\r\n") : text;
};

export const writeObjectFile = (
  frontmatter: ObjectFrontmatter,
  body: string,
  baseText?: string,
): string => {
  assertAttributes(frontmatter.attributes);
  let base: { document: FrontmatterDocument; yamlText: string } | undefined;
  if (baseText !== undefined) {
    const split = splitObjectFile(baseText);
    if (split.kind !== "ok") {
      throw new Error(t("error.invalidFrontmatter", { problems: splitProblem(split.kind) }));
    }
    const read = readFrontmatter(split.yamlText);
    if (!read.ok) {
      throw new Error(t("error.invalidFrontmatter", { problems: read.problems.join("; ") }));
    }
    base = { document: read.source, yamlText: split.yamlText };
  }
  const eol = (base?.yamlText ?? "").includes("\r\n") ? "\r\n" : "\n";
  const source = base?.document;
  const document = source?.document ?? new Document();
  const hasBase = base !== undefined;
  const values = source?.values ?? {};
  const presentKeys = new Set(source?.keys ?? []);
  const reservedDirty = mergeReserved(document, hasBase, presentKeys, values, frontmatter);
  const attributesDirty = mergeAttributes(
    document,
    hasBase,
    presentKeys,
    values,
    frontmatter.attributes,
  );
  const unchanged = hasBase && !reservedDirty && !attributesDirty;
  const yamlText =
    unchanged && base !== undefined ? base.yamlText : stringifySection(document, eol);
  return joinObjectFile(yamlText, body, eol);
};
