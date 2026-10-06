import { validateAttributeValue } from "../frontmatter/index.js";
import { isReservedKey } from "../frontmatter/keys.js";
import { FIELD_TYPE_WIRES, type TypeDefinition } from "../types/index.js";

export type AttributeCheck = {
  problems: string[];
  missing: string[];
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isWritableValue = (value: unknown): boolean => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isWritableValue);
  }
  if (isPlainObject(value)) {
    return Object.values(value).every(isWritableValue);
  }
  return false;
};

const checkFreeAttribute = (key: string, value: unknown, problems: string[]): void => {
  if (isReservedKey(key)) {
    problems.push(`reserved key "${key}" cannot be used as an attribute`);
    return;
  }
  if (!isWritableValue(value)) {
    problems.push(
      `attribute "${key}" must hold JSON-compatible data (string, finite number, boolean, null, list or plain object)`,
    );
  }
};

export const checkAttributeSafety = (attributes: Record<string, unknown>): string[] => {
  const problems: string[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) {
      checkFreeAttribute(key, value, problems);
    }
  }
  return problems;
};

export const checkAttributes = (
  definition: TypeDefinition,
  attributes: Record<string, unknown>,
): AttributeCheck => {
  const problems: string[] = [];
  const missing: string[] = [];
  for (const attribute of definition.attributes) {
    if (!attribute.required) {
      continue;
    }
    const value: unknown = attributes[attribute.id];
    if (value === undefined || value === null) {
      missing.push(attribute.id);
    }
  }
  const defined = new Map(definition.attributes.map((attribute) => [attribute.id, attribute]));
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) {
      continue;
    }
    const attribute = defined.get(key);
    if (attribute === undefined) {
      checkFreeAttribute(key, value, problems);
      continue;
    }
    if (value === null) {
      continue;
    }
    const opciones = attribute.options === undefined ? undefined : { opciones: attribute.options };
    const fieldProblems = validateAttributeValue(FIELD_TYPE_WIRES[attribute.type], value, opciones);
    for (const problem of fieldProblems) {
      problems.push(`attribute "${key}": ${problem}`);
    }
  }
  return { problems, missing };
};
