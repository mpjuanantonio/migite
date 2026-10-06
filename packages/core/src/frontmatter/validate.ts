export type FieldDefinition = { readonly opciones?: readonly string[] };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:[Zz]|[+-](?:0\d|1[0-4]):[0-5]\d)$/;
const WIKILINK_PATTERN = /^\[\[[^[\]]+\]\]$/;

const isCalendarDate = (value: string): boolean => {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed.toISOString().slice(0, 10) === value;
};

const isDateTime = (value: string): boolean =>
  DATETIME_PATTERN.test(value) &&
  isCalendarDate(value.slice(0, 10)) &&
  !Number.isNaN(Date.parse(value));

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const isWikilink = (value: unknown): value is string =>
  typeof value === "string" && WIKILINK_PATTERN.test(value);

const isRelativePath = (value: string): boolean => {
  if (value.length === 0 || value.startsWith("/") || value.startsWith("\\")) {
    return false;
  }
  if (/^[A-Za-z]:/.test(value)) {
    return false;
  }
  return !value.split(/[\\/]/).includes("..");
};

const describeValue = (value: unknown): string => {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (Array.isArray(value)) {
    return "a list";
  }
  if (typeof value === "object") {
    return "an object";
  }
  return String(value);
};

const optionProblems = (
  items: readonly unknown[],
  opciones: readonly string[],
  problems: string[],
): void => {
  for (const item of items) {
    if (typeof item === "string" && !opciones.includes(item)) {
      problems.push(`value ${describeValue(item)} is not one of the declared options`);
    }
  }
};

export const validateAttributeValue = (
  fieldTypeWire: string,
  value: unknown,
  definition?: FieldDefinition,
): string[] => {
  const problems: string[] = [];
  const opciones = definition?.opciones;
  switch (fieldTypeWire) {
    case "texto": {
      if (typeof value !== "string") {
        problems.push(`expected a string, got ${describeValue(value)}`);
      }
      break;
    }
    case "numero": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        problems.push(`expected a finite number, got ${describeValue(value)}`);
      }
      break;
    }
    case "fecha": {
      if (typeof value !== "string" || !isCalendarDate(value)) {
        problems.push(`expected an ISO date (YYYY-MM-DD), got ${describeValue(value)}`);
      }
      break;
    }
    case "fecha-hora": {
      if (typeof value !== "string" || !isDateTime(value)) {
        problems.push(`expected an ISO 8601 datetime with offset, got ${describeValue(value)}`);
      }
      break;
    }
    case "booleano": {
      if (typeof value !== "boolean") {
        problems.push(`expected true or false, got ${describeValue(value)}`);
      }
      break;
    }
    case "seleccion": {
      if (typeof value !== "string") {
        problems.push(`expected a string, got ${describeValue(value)}`);
      } else if (opciones !== undefined && !opciones.includes(value)) {
        problems.push(`value ${describeValue(value)} is not one of the declared options`);
      }
      break;
    }
    case "multi-seleccion": {
      if (!Array.isArray(value)) {
        problems.push(`expected a list, got ${describeValue(value)}`);
        break;
      }
      const items: unknown[] = value;
      if (!items.every((item) => typeof item === "string")) {
        problems.push(`expected a list of strings, got ${describeValue(value)}`);
        break;
      }
      if (opciones !== undefined) {
        optionProblems(items, opciones, problems);
      }
      break;
    }
    case "url": {
      if (typeof value !== "string" || !isHttpUrl(value)) {
        problems.push(`expected an http(s) URL, got ${describeValue(value)}`);
      }
      break;
    }
    case "referencia": {
      if (typeof value === "string") {
        if (!isWikilink(value)) {
          problems.push(`expected a wikilink like "[[Page]]", got ${describeValue(value)}`);
        }
        break;
      }
      if (Array.isArray(value)) {
        const items: unknown[] = value;
        if (!items.every((item) => isWikilink(item))) {
          problems.push(`expected a list of wikilinks, got ${describeValue(value)}`);
        }
        break;
      }
      problems.push(`expected a wikilink or a list of wikilinks, got ${describeValue(value)}`);
      break;
    }
    case "archivo": {
      if (typeof value !== "string" || !isRelativePath(value)) {
        problems.push(`expected a relative path, got ${describeValue(value)}`);
      }
      break;
    }
    default: {
      problems.push(`unknown field type "${fieldTypeWire}"`);
    }
  }
  return problems;
};
