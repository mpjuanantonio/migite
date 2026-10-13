import { parse as parseYaml, YAMLParseError } from "yaml";
import { defaultLocale, type Locale, t } from "../i18n/index.js";
import {
  type AttributeDefinition,
  isReservedTypeId,
  type TypeDefinition,
  type TypePresentation,
  WIRE_TO_ATTRIBUTE_ROLE,
  WIRE_TO_FIELD_TYPE,
} from "./definitions.js";
import {
  attributeSchema,
  formatIssues,
  presentationIssues,
  presentationSchema,
  typeFileSchema,
} from "./schema.js";

export interface AttributeProblem {
  id: string;
  problems: string[];
}

export interface TypeFileDetails {
  definition: TypeDefinition | null;
  fileProblems: string[];
  typeWarnings: string[];
  attributeWarnings: AttributeProblem[];
}

const REQUIRED_TYPE_FIELDS = ["id", "nombre", "atributos"] as const;

const KNOWN_TYPE_FIELDS = new Set<string>([...REQUIRED_TYPE_FIELDS, "descripcion", "presentacion"]);

const isMapping = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const yamlProblem = (error: unknown, locale: Locale): string => {
  if (error instanceof YAMLParseError) {
    const position = error.linePos?.[0];
    return position === undefined
      ? t("error.invalidYamlSyntaxCode", { code: error.code }, locale)
      : t(
          "error.invalidYamlSyntaxAt",
          { code: error.code, line: position.line, column: position.col },
          locale,
        );
  }
  return t("error.invalidYamlSyntax", undefined, locale);
};

const attributeEntryId = (entry: unknown, index: number): string => {
  if (isMapping(entry) && typeof entry.id === "string" && entry.id.trim() !== "") {
    return entry.id.trim();
  }
  return `#${index}`;
};

const parsePresentation = (value: unknown, warnings: string[]): TypePresentation | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const parsed = presentationSchema.safeParse(value);
  if (!parsed.success) {
    warnings.push(...presentationIssues(parsed.error));
    return undefined;
  }
  return {
    ...(parsed.data.seccion === undefined ? {} : { seccion: parsed.data.seccion }),
    ...(parsed.data.carpeta === undefined ? {} : { carpeta: parsed.data.carpeta }),
    ...(parsed.data.visible === undefined ? {} : { visible: parsed.data.visible }),
  };
};

const parseTypeFile = (text: string, locale: Locale): TypeFileDetails => {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (error) {
    return {
      definition: null,
      fileProblems: [yamlProblem(error, locale)],
      typeWarnings: [],
      attributeWarnings: [],
    };
  }

  if (!isMapping(raw)) {
    return {
      definition: null,
      fileProblems: ["document must be a mapping with id, nombre and atributos"],
      typeWarnings: [],
      attributeWarnings: [],
    };
  }

  const missing = REQUIRED_TYPE_FIELDS.filter((field) => !Object.hasOwn(raw, field));
  if (missing.length > 0) {
    return {
      definition: null,
      fileProblems: missing.map((field) => `missing required field "${field}"`),
      typeWarnings: [],
      attributeWarnings: [],
    };
  }

  const typeWarnings = Object.keys(raw)
    .filter((key) => !KNOWN_TYPE_FIELDS.has(key))
    .map((key) => `unknown key "${key}" ignored`);

  const parsedType = typeFileSchema.safeParse(raw);
  if (!parsedType.success) {
    return {
      definition: null,
      fileProblems: [...typeWarnings, ...formatIssues(parsedType.error)],
      typeWarnings: [],
      attributeWarnings: [],
    };
  }

  const fileProblems: string[] = [];
  const attributes: AttributeDefinition[] = [];
  const attributeWarnings: AttributeProblem[] = [];
  const seen = new Set<string>();
  const presentacion = parsePresentation(raw.presentacion, typeWarnings);

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
      ...(presentacion === undefined ? {} : { presentacion }),
    },
    fileProblems,
    typeWarnings,
    attributeWarnings,
  };
};

export const parseTypeDetails = (text: string, locale: Locale = defaultLocale): TypeFileDetails => {
  try {
    return parseTypeFile(text, locale);
  } catch {
    return {
      definition: null,
      fileProblems: [t("error.invalidYamlSyntax", undefined, locale)],
      typeWarnings: [],
      attributeWarnings: [],
    };
  }
};

export const parseTypeYaml = (
  text: string,
  locale: Locale = defaultLocale,
): { ok: true; value: TypeDefinition } | { ok: false; problems: string[] } => {
  const details = parseTypeDetails(text, locale);
  return details.definition === null
    ? { ok: false, problems: [...details.fileProblems] }
    : { ok: true, value: details.definition };
};
