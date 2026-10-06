import { validateAttributeValue } from "../frontmatter/index.js";
import { FIELD_TYPE_WIRES, type TypeDefinition, type TypeWarning } from "../types/index.js";
import type { DegradationReason } from "./model.js";

export type RegistryView = {
  types: ReadonlyMap<string, TypeDefinition>;
  warnings: readonly TypeWarning[];
};

const warningMatchesType = (path: string, typeId: string): boolean => {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  const id = typeId.toLowerCase();
  return normalized.endsWith(`/${id}.yaml`) || normalized.endsWith(`/${id}.yml`);
};

const typeReason = (registry: RegistryView, typeId: string): DegradationReason | undefined => {
  if (registry.types.has(typeId)) {
    return undefined;
  }
  const problems = registry.warnings
    .filter((warning) => warningMatchesType(warning.path, typeId))
    .flatMap((warning) => warning.problems);
  return problems.length > 0
    ? { kind: "brokenType", type: typeId, problems }
    : { kind: "unknownType", type: typeId };
};

const attributeReasons = (
  definition: TypeDefinition | undefined,
  attributes: Record<string, unknown>,
): DegradationReason[] => {
  if (definition === undefined) {
    return [];
  }
  const declared = new Map(definition.attributes.map((attribute) => [attribute.id, attribute]));
  const reasons: DegradationReason[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) {
      continue;
    }
    const attribute = declared.get(key);
    if (attribute === undefined) {
      continue;
    }
    const opciones = attribute.options === undefined ? undefined : { opciones: attribute.options };
    const problems = validateAttributeValue(FIELD_TYPE_WIRES[attribute.type], value, opciones);
    if (problems.length > 0) {
      reasons.push({ kind: "invalidAttribute", key, problems });
    }
  }
  return reasons;
};

export const degradationReasons = (
  registry: RegistryView,
  typeId: string,
  attributes: Record<string, unknown>,
): DegradationReason[] => {
  const reasons: DegradationReason[] = [];
  const typeIssue = typeReason(registry, typeId);
  if (typeIssue !== undefined) {
    reasons.push(typeIssue);
  }
  reasons.push(...attributeReasons(registry.types.get(typeId), attributes));
  return reasons;
};

export const isTypeDegraded = (reasons: readonly DegradationReason[]): boolean =>
  reasons.some((reason) => reason.kind === "unknownType" || reason.kind === "brokenType");
