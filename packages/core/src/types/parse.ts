import { parse as parseYaml, YAMLParseError } from "yaml";
import {
  type AttributeDefinition,
  isReservedTypeId,
  type TypeDefinition,
  WIRE_TO_ATTRIBUTE_ROLE,
  WIRE_TO_FIELD_TYPE,
} from "./definitions.js";
import { attributeSchema, formatIssues, typeFileSchema } from "./schema.js";

export interface AttributeProblem {
  id: string;
  problems: string[];
}

export interface TypeFileDetails {
  definition: TypeDefinition | null;
  fileProblems: string[];
  attributeWarnings: AttributeProblem[];
}

const REQUIRED_TYPE_FIELDS = ["id", "nombre", "atributos"] as const;

const KNOWN_TYPE_FIELDS = new Set<string>([...REQUIRED_TYPE_FIELDS, "descripcion"]);

const isMapping = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const yamlProblem = (error: unknown): string => {
  if (error instanceof YAMLParseError) {
    const position = error.linePos?.[0];
    return position === undefined
      ? `invalid YAML syntax (${error.code})`
      : `invalid YAML syntax (${error.code}, line ${position.line}, column ${position.col})`;
  }
  return "invalid YAML syntax";
};

const attributeEntryId = (entry: unknown, index: number): string => {
  if (isMapping(entry) && typeof entry.id === "string" && entry.id.trim() !== "") {
    return entry.id.trim();
  }
  return `#${index}`;
};

const parseTypeFile = (text: string): TypeFileDetails => {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (error) {
    return { definition: null, fileProblems: [yamlProblem(error)], attributeWarnings: [] };
  }

  if (!isMapping(raw)) {
    return {
      definition: null,
      fileProblems: ["document must be a mapping with id, nombre and atributos"],
      attributeWarnings: [],
    };
  }

  const missing = REQUIRED_TYPE_FIELDS.filter((field) => !Object.hasOwn(raw, field));
  if (missing.length > 0) {
    return {
      definition: null,
      fileProblems: missing.map((field) => `missing required field "${field}"`),
      attributeWarnings: [],
    };
  }

  const fileProblems = Object.keys(raw)
    .filter((key) => !KNOWN_TYPE_FIELDS.has(key))
    .map((key) => `unknown key "${key}" ignored`);

  const parsedType = typeFileSchema.safeParse(raw);
  if (!parsedType.success) {
    return {
      definition: null,
      fileProblems: [...fileProblems, ...formatIssues(parsedType.error)],
      attributeWarnings: [],
    };
  }

  const attributes: AttributeDefinition[] = [];
  const attributeWarnings: AttributeProblem[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of parsedType.data.atributos.entries()) {
    const parsedAttribute = attributeSchema.safeParse(entry);
    if (!parsedAttribute.success) {
      attributeWarnings.push({
        id: attributeEntryId(entry, index),
        problems: formatIssues(parsedAttribute.error),
      });
      continue;
    }

    const { id, nombre, tipo, rol, obligatorio, opciones, referencia_a } = parsedAttribute.data;
    if (seen.has(id)) {
      fileProblems.push(`duplicate attribute id "${id}", first definition kept`);
      continue;
    }
    seen.add(id);

    const attribute: AttributeDefinition = {
      id,
      name: nombre,
      type: WIRE_TO_FIELD_TYPE[tipo],
      required: obligatorio,
    };
    if (rol !== undefined) {
      attribute.role = WIRE_TO_ATTRIBUTE_ROLE[rol];
    }
    if (opciones !== undefined && opciones.length > 0) {
      attribute.options = [...opciones];
    }
    if (referencia_a !== undefined && referencia_a.length > 0) {
      attribute.references = [...referencia_a];
    }
    attributes.push(attribute);
  }

  const { id, nombre, descripcion } = parsedType.data;

  return {
    definition: {
      id,
      name: nombre,
      attributes,
      system: isReservedTypeId(id),
      ...(descripcion === undefined ? {} : { description: descripcion }),
    },
    fileProblems,
    attributeWarnings,
  };
};

export const parseTypeDetails = (text: string): TypeFileDetails => {
  try {
    return parseTypeFile(text);
  } catch {
    return { definition: null, fileProblems: ["invalid YAML syntax"], attributeWarnings: [] };
  }
};

export const parseTypeYaml = (
  text: string,
): { ok: true; value: TypeDefinition } | { ok: false; problems: string[] } => {
  const details = parseTypeDetails(text);
  return details.definition === null
    ? { ok: false, problems: [...details.fileProblems] }
    : { ok: true, value: details.definition };
};
