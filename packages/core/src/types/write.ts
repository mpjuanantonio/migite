import { mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Document, isMap, isSeq, parseDocument } from "yaml";
import { createFileExclusive, writeFileAtomic } from "../objects/atomic.js";
import {
  ATTRIBUTE_ROLE_WIRES,
  type AttributeDefinition,
  FIELD_TYPE_WIRES,
  isReservedTypeId,
  type TypeDefinition,
  type TypePresentation,
} from "./definitions.js";
import { TypeOperationError } from "./errors.js";
import { parseTypeDetails, type TypeFileDetails } from "./parse.js";
import { presentationIssues, presentationSchema, typeFileSchema } from "./schema.js";

export type CreateTypeInput = Omit<TypeDefinition, "system">;

export interface UpdateTypeChanges {
  readonly name?: string;
  readonly description?: string;
  readonly attributes?: readonly AttributeDefinition[];
  readonly presentacion?: TypePresentation;
}

const FLOW_KEYS = ["opciones", "referencia_a"] as const;

const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;

const isSafeTypeId = (id: string): boolean => typeFileSchema.shape.id.safeParse(id).success;

const typeFilePath = (tiposDir: string, id: string): string => join(tiposDir, `${id}.yaml`);

const notEditable = (id: string): TypeOperationError =>
  new TypeOperationError("error.typeNotEditable", { id });

const notFound = (id: string): TypeOperationError =>
  new TypeOperationError("error.notFound", { id });

const invalidDefinition = (problems: readonly string[]): TypeOperationError =>
  new TypeOperationError("error.validationError", {}, problems);

const definitionProblems = (details: TypeFileDetails): string[] => [
  ...details.fileProblems,
  ...details.attributeWarnings.flatMap((warning) =>
    warning.problems.map((problem) => `attribute "${warning.id}": ${problem}`),
  ),
];

const wireAttribute = (attribute: AttributeDefinition): Record<string, unknown> => ({
  id: attribute.id,
  nombre: attribute.name,
  tipo: FIELD_TYPE_WIRES[attribute.type],
  ...(attribute.role === undefined ? {} : { rol: ATTRIBUTE_ROLE_WIRES[attribute.role] }),
  obligatorio: attribute.required,
  opciones: [...(attribute.options ?? [])],
  referencia_a: [...(attribute.references ?? [])],
});

const wirePresentation = (presentation: TypePresentation): Record<string, unknown> => ({
  ...(presentation.seccion === undefined ? {} : { seccion: presentation.seccion }),
  ...(presentation.carpeta === undefined ? {} : { carpeta: presentation.carpeta }),
  ...(presentation.visible === undefined ? {} : { visible: presentation.visible }),
});

const wireDefinition = (input: CreateTypeInput): Record<string, unknown> => ({
  id: input.id,
  nombre: input.name,
  ...(input.description === undefined ? {} : { descripcion: input.description }),
  atributos: input.attributes.map(wireAttribute),
  ...(input.presentacion === undefined
    ? {}
    : { presentacion: wirePresentation(input.presentacion) }),
});

const applyFlowCollections = (document: Document): void => {
  if (!isMap(document.contents)) {
    return;
  }
  const attributes = document.contents.get("atributos");
  if (!isSeq(attributes)) {
    return;
  }
  for (const attribute of attributes.items) {
    if (!isMap(attribute)) {
      continue;
    }
    for (const key of FLOW_KEYS) {
      const values = attribute.get(key);
      if (isSeq(values)) {
        values.flow = true;
      }
    }
  }
};

const renderTypeYaml = (input: CreateTypeInput): string => {
  const document = new Document(wireDefinition(input));
  applyFlowCollections(document);
  return document.toString({ lineWidth: 0, flowCollectionPadding: false });
};

const renderMergedTypeYaml = (text: string, input: CreateTypeInput): string => {
  const document = parseDocument(text);
  if (!isMap(document.contents)) {
    throw invalidDefinition(["document must be a mapping with id, nombre and atributos"]);
  }
  for (const [key, value] of Object.entries(wireDefinition(input))) {
    document.set(key, value);
  }
  if (input.description === undefined) {
    document.delete("descripcion");
  }
  applyFlowCollections(document);
  return document.toString({ lineWidth: 0, flowCollectionPadding: false });
};

const presentationDefinitionProblems = (presentation: TypePresentation | undefined): string[] => {
  if (presentation === undefined) {
    return [];
  }
  const parsed = presentationSchema.safeParse(presentation);
  return parsed.success ? [] : presentationIssues(parsed.error);
};

const normalizeDefinition = (input: CreateTypeInput): TypeDefinition => {
  const presentationProblems = presentationDefinitionProblems(input.presentacion);
  if (presentationProblems.length > 0) {
    throw invalidDefinition(presentationProblems);
  }
  const details = parseTypeDetails(renderTypeYaml(input));
  const problems = definitionProblems(details);
  if (details.definition === null || problems.length > 0) {
    throw invalidDefinition(problems);
  }
  return details.definition;
};

interface ReadTypeFile {
  definition: TypeDefinition;
  text: string;
}

const readTypeFile = (tiposDir: string, id: string): ReadTypeFile => {
  if (!isSafeTypeId(id)) {
    throw notFound(id);
  }
  let text: string;
  try {
    text = readFileSync(typeFilePath(tiposDir, id), "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw notFound(id);
    }
    throw error;
  }
  const details = parseTypeDetails(text);
  const problems = definitionProblems(details);
  if (details.definition === null || problems.length > 0) {
    throw invalidDefinition(problems);
  }
  if (details.definition.id !== id) {
    throw invalidDefinition([
      `type id "${details.definition.id}" does not match file "${id}.yaml"`,
    ]);
  }
  return { definition: details.definition, text };
};

const evolveAttributes = (
  current: readonly AttributeDefinition[],
  next: readonly AttributeDefinition[],
): AttributeDefinition[] => {
  const previousById = new Map(current.map((attribute) => [attribute.id, attribute]));
  for (const attribute of next) {
    const previous = previousById.get(attribute.id);
    if (previous !== undefined && previous.type !== attribute.type) {
      throw new TypeOperationError("error.attributeTypeImmutable", { id: attribute.id });
    }
  }
  return [...next];
};

export const createTypeFile = (tiposDir: string, input: CreateTypeInput): TypeDefinition => {
  if (isReservedTypeId(input.id)) {
    throw notEditable(input.id);
  }
  const definition = normalizeDefinition(input);
  mkdirSync(tiposDir, { recursive: true });
  try {
    createFileExclusive(typeFilePath(tiposDir, definition.id), renderTypeYaml(definition));
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      throw new TypeOperationError("error.typeAlreadyExists", { id: definition.id });
    }
    throw error;
  }
  return definition;
};

export const updateTypeFile = (
  tiposDir: string,
  id: string,
  changes: UpdateTypeChanges,
): TypeDefinition => {
  if (isReservedTypeId(id)) {
    throw notEditable(id);
  }
  const current = readTypeFile(tiposDir, id);
  const attributes =
    changes.attributes === undefined
      ? current.definition.attributes
      : evolveAttributes(current.definition.attributes, changes.attributes);
  const description = changes.description ?? current.definition.description;
  const presentacion = changes.presentacion ?? current.definition.presentacion;
  const definition = normalizeDefinition({
    id: current.definition.id,
    name: changes.name ?? current.definition.name,
    ...(description === undefined ? {} : { description }),
    attributes,
    ...(presentacion === undefined ? {} : { presentacion }),
  });
  writeFileAtomic(
    typeFilePath(tiposDir, definition.id),
    renderMergedTypeYaml(current.text, definition),
  );
  return definition;
};

export const deleteTypeFile = (tiposDir: string, id: string): void => {
  if (isReservedTypeId(id)) {
    throw notEditable(id);
  }
  if (!isSafeTypeId(id)) {
    throw notFound(id);
  }
  try {
    unlinkSync(typeFilePath(tiposDir, id));
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw notFound(id);
    }
    throw error;
  }
};
