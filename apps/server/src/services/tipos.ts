import { type AttributePayload, type TipoPayload, tipoPayloadSchema } from "@migite/contracts";
import {
  ATTRIBUTE_ROLE_WIRES,
  type AttributeDefinition,
  createTypeFile,
  deleteTypeFile,
  FIELD_TYPE_WIRES,
  loadTypeRegistry,
  type TypeDefinition,
  updateTypeFile,
  WIRE_TO_ATTRIBUTE_ROLE,
  WIRE_TO_FIELD_TYPE,
} from "@migite/core";

export type TiposDeps = {
  readonly tiposDir: string;
};

export type TipoChanges = {
  readonly nombre?: string;
  readonly descripcion?: string;
  readonly atributos?: readonly AttributePayload[];
};

const toAttributePayload = (attribute: AttributeDefinition): AttributePayload => ({
  id: attribute.id,
  nombre: attribute.name,
  tipo: FIELD_TYPE_WIRES[attribute.type],
  ...(attribute.role === undefined ? {} : { rol: ATTRIBUTE_ROLE_WIRES[attribute.role] }),
  obligatorio: attribute.required,
  ...(attribute.options === undefined ? {} : { opciones: [...attribute.options] }),
  ...(attribute.references === undefined ? {} : { referencia_a: [...attribute.references] }),
});

const toPayload = (definition: TypeDefinition): TipoPayload =>
  tipoPayloadSchema.parse({
    id: definition.id,
    nombre: definition.name,
    ...(definition.description === undefined ? {} : { descripcion: definition.description }),
    atributos: definition.attributes.map(toAttributePayload),
  });

const toAttributes = (attributes: readonly AttributePayload[]): AttributeDefinition[] =>
  attributes.map((attribute) => ({
    id: attribute.id,
    name: attribute.nombre,
    type: WIRE_TO_FIELD_TYPE[attribute.tipo],
    ...(attribute.rol === undefined ? {} : { role: WIRE_TO_ATTRIBUTE_ROLE[attribute.rol] }),
    required: attribute.obligatorio,
    ...(attribute.opciones === undefined ? {} : { options: [...attribute.opciones] }),
    ...(attribute.referencia_a === undefined ? {} : { references: [...attribute.referencia_a] }),
  }));

export const listarTipos = (deps: TiposDeps): TipoPayload[] => {
  const registry = loadTypeRegistry(deps.tiposDir);
  return [...registry.types.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(toPayload);
};

export const crearTipo = (deps: TiposDeps, input: TipoPayload): TipoPayload =>
  toPayload(
    createTypeFile(deps.tiposDir, {
      id: input.id,
      name: input.nombre,
      ...(input.descripcion === undefined ? {} : { description: input.descripcion }),
      attributes: toAttributes(input.atributos),
    }),
  );

export const actualizarTipo = (deps: TiposDeps, id: string, changes: TipoChanges): TipoPayload =>
  toPayload(
    updateTypeFile(deps.tiposDir, id, {
      ...(changes.nombre === undefined ? {} : { name: changes.nombre }),
      ...(changes.descripcion === undefined ? {} : { description: changes.descripcion }),
      ...(changes.atributos === undefined ? {} : { attributes: toAttributes(changes.atributos) }),
    }),
  );

export const eliminarTipo = (deps: TiposDeps, id: string): void => {
  deleteTypeFile(deps.tiposDir, id);
};
