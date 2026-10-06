import { isMap, parseDocument } from "yaml";
import { isReservedKey } from "./keys.js";
import { splitObjectFile } from "./split.js";

export type SalvagedObject = {
  title: string | undefined;
  body: string;
  attributes: Record<string, unknown>;
};

const TITLE_LINE = /^[ \t]*titulo:[ \t]*(.*)$/m;

const unquote = (value: string): string => {
  if (value.length < 2) {
    return value;
  }
  const first = value[0];
  const last = value[value.length - 1];
  return (first === '"' && last === '"') || (first === "'" && last === "'")
    ? value.slice(1, -1)
    : value;
};

const salvageAttributes = (yamlText: string): Record<string, unknown> => {
  if (yamlText.trim() === "") {
    return {};
  }
  const document = parseDocument(yamlText);
  if (!isMap(document.contents)) {
    return {};
  }
  let resolved: unknown;
  try {
    resolved = document.toJS();
  } catch {
    return {};
  }
  if (typeof resolved !== "object" || resolved === null || Array.isArray(resolved)) {
    return {};
  }
  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(resolved)) {
    if (!isReservedKey(key)) {
      attributes[key] = value;
    }
  }
  return attributes;
};

export const salvageObject = (text: string): SalvagedObject => {
  const split = splitObjectFile(text);
  const yamlText = split.kind === "ok" ? split.yamlText : "";
  const body = split.kind === "ok" ? split.body : text;
  const match = TITLE_LINE.exec(yamlText);
  const title = match === null ? "" : unquote((match[1] ?? "").trim());
  return {
    title: title === "" ? undefined : title,
    body,
    attributes: salvageAttributes(yamlText),
  };
};
