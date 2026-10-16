import {
  type BorrarObjetoPayload,
  borrarObjetoPayloadSchema,
  type CrearObjetoPayload,
  crearObjetoPayloadSchema,
  crearTipoPayloadSchema,
  type EditarObjetoPayload,
  editarObjetoPayloadSchema,
  type GuardarMemoriaPayload,
  guardarMemoriaPayloadSchema,
} from "@migite/contracts";
import { createObjectRepository, isReservedTypeId, slugify } from "@migite/core";
import { crearAccion, type IndexDatabase } from "@migite/index";
import type { JsonValue, ToolRegistry } from "@migite/llm";
import { z } from "zod";

export type HerramientasEscrituraDeps = {
  readonly db: IndexDatabase;
  readonly vaultDir: string;
};

const TIPO_ACCION_POR_DEFECTO = "nota";

const crearTipoArgsSchema = z.object({
  definicion: crearTipoPayloadSchema,
});

type CrearTipoArgs = z.output<typeof crearTipoArgsSchema>;

const proponer = (
  deps: HerramientasEscrituraDeps,
  tipoAccion: string,
  payload: unknown,
  resumen: string,
): JsonValue => {
  const accion = crearAccion(deps.db, { tipoAccion, payload });
  return {
    accion_propuesta: {
      id: accion.id,
      tipoAccion: accion.tipoAccion,
      estado: "pendiente",
      resumen,
    },
  };
};

const leerTitulo = (deps: HerramientasEscrituraDeps, ref: string): string => {
  const result = createObjectRepository({ vaultDir: deps.vaultDir }).readObject(ref);
  return result.ok ? result.object.title : result.degraded.title;
};

const tituloSiSeConoce = (deps: HerramientasEscrituraDeps, ref: string): string | undefined => {
  try {
    return leerTitulo(deps, ref);
  } catch {
    return undefined;
  }
};

export const registrarHerramientasDeEscritura = (
  registry: ToolRegistry,
  deps: HerramientasEscrituraDeps,
): void => {
  const crear = (payload: CrearObjetoPayload): JsonValue =>
    proponer(
      deps,
      "crear_objeto",
      payload,
      `Crear ${payload.tipo ?? TIPO_ACCION_POR_DEFECTO} «${payload.titulo}»`,
    );

  const editar = ({ id, cambios }: EditarObjetoPayload): JsonValue => {
    if (Object.keys(cambios).length === 0) {
      throw new Error(`no hay cambios que proponer para el objeto ${id}`);
    }
    const titulo = tituloSiSeConoce(deps, id);
    return proponer(
      deps,
      "editar_objeto",
      { id, cambios },
      titulo === undefined ? `Editar objeto ${id}` : `Editar «${titulo}»`,
    );
  };

  const borrar = ({ id }: BorrarObjetoPayload): JsonValue => {
    const titulo = leerTitulo(deps, id);
    return proponer(deps, "borrar_objeto", { id }, `Borrar «${titulo}»`);
  };

  const recordar = ({ clave, contenido }: GuardarMemoriaPayload): JsonValue =>
    proponer(deps, "guardar_memoria", { clave, contenido }, `Recordar «${clave}»`);

  const crearTipo = ({ definicion }: CrearTipoArgs): JsonValue => {
    const id = definicion.id ?? slugify(definicion.nombre);
    if (isReservedTypeId(id)) {
      throw new Error(`el tipo «${id}» es nativo y no se puede crear de nuevo`);
    }
    return proponer(deps, "crear_tipo", definicion, `Crear tipo «${definicion.nombre}»`);
  };

  registry.registerTool({
    name: "crear_objeto",
    description:
      "Propone crear un objeto en el vault sin crearlo: registra una acción pendiente de confirmación con tipo, título, atributos, cuerpo, carpeta y enlaces. La persona usuaria debe confirmarla antes de que se aplique.",
    schema: crearObjetoPayloadSchema,
    handler: crear,
  });
  registry.registerTool({
    name: "editar_objeto",
    description:
      "Propone editar un objeto existente sin modificarlo: registra una acción pendiente de confirmación con su título y los cambios de cuerpo, atributos, carpeta o título. La persona usuaria debe confirmarla antes de que se aplique.",
    schema: editarObjetoPayloadSchema,
    handler: editar,
  });
  registry.registerTool({
    name: "borrar_objeto",
    description:
      "Propone borrar un objeto del vault sin borrarlo: registra una acción pendiente de confirmación con el título del objeto para que la persona usuaria decida con información. La persona usuaria debe confirmarla antes de que se aplique.",
    schema: borrarObjetoPayloadSchema,
    handler: borrar,
  });
  registry.registerTool({
    name: "recordar_dato",
    description:
      "Propone guardar un dato en la memoria del agente sin guardarlo: registra una acción pendiente de confirmación con la clave y el contenido para que la persona usuaria decida si lo recuerda en conversaciones futuras. La persona usuaria debe confirmarla antes de que se aplique.",
    schema: guardarMemoriaPayloadSchema,
    handler: recordar,
  });
  registry.registerTool({
    name: "crear_tipo",
    description:
      "Propone crear un tipo de objeto personalizado sin crearlo: registra una acción pendiente de confirmación con la definición del tipo (id opcional, nombre, descripción, atributos y presentación). La persona usuaria debe confirmarla antes de que se aplique.",
    schema: crearTipoArgsSchema,
    handler: crearTipo,
  });
};
