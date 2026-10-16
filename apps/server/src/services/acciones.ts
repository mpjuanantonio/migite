import { join } from "node:path";
import {
  type Accion,
  type AccionPropuesta,
  accionPropuestaSchema,
  accionSchema,
  type EstadoAccion,
} from "@migite/contracts";
import { createObjectRepository, createTypeFile, slugify } from "@migite/core";
import {
  type AccionRecord,
  actualizarEstadoAccion,
  guardarMemoria,
  type IndexDatabase,
  listarAcciones as listarAccionesEnIndice,
  obtenerAccion,
} from "@migite/index";
import { sanitizeWatcherError } from "../runtime.js";
import { patchObjeto, renameObjeto } from "./objetos.js";
import { toAttributes } from "./tipos.js";

export type AccionesDeps = {
  readonly db: IndexDatabase;
  readonly vaultDir: string;
  readonly timeZone?: string;
};

export type AccionErrorCodigo = "action_not_found" | "action_conflict";

export class ActionError extends Error {
  readonly codigo: AccionErrorCodigo;

  constructor(codigo: AccionErrorCodigo) {
    super(codigo);
    this.name = "ActionError";
    this.codigo = codigo;
  }
}

const toWire = (record: AccionRecord): Accion =>
  accionSchema.parse({
    id: record.id,
    tipoAccion: record.tipoAccion,
    payload: record.payload,
    estado: record.estado,
    creada: record.creada,
    ...(record.detalle === undefined ? {} : { detalle: record.detalle }),
    ...(record.resultado === undefined ? {} : { resultado: record.resultado }),
  });

const repositorioDe = (deps: AccionesDeps): ReturnType<typeof createObjectRepository> =>
  createObjectRepository({ vaultDir: deps.vaultDir, timeZone: deps.timeZone });

const aplicarPropuesta = (deps: AccionesDeps, propuesta: AccionPropuesta): unknown => {
  switch (propuesta.tipoAccion) {
    case "crear_objeto": {
      const creado = repositorioDe(deps).createObject({
        title: propuesta.payload.titulo,
        type: propuesta.payload.tipo,
        body: propuesta.payload.cuerpo,
        attributes: propuesta.payload.atributos,
        links: propuesta.payload.enlaces,
        folder: propuesta.payload.carpeta,
      });
      return { id: creado.id };
    }
    case "editar_objeto": {
      const { id, cambios } = propuesta.payload;
      const { titulo, ...resto } = cambios;
      let ref = id;
      if (titulo !== undefined) {
        ref = renameObjeto(deps, id, titulo).objeto.id;
      }
      if (Object.keys(resto).length === 0) {
        return { id: ref };
      }
      const editado = patchObjeto(deps, ref, resto);
      return { id: editado.id };
    }
    case "borrar_objeto": {
      repositorioDe(deps).deleteObject(propuesta.payload.id);
      return { id: propuesta.payload.id };
    }
    case "guardar_memoria": {
      const memoria = guardarMemoria(deps.db, propuesta.payload);
      return { id: memoria.id };
    }
    case "crear_tipo": {
      const { id, nombre, descripcion, atributos, presentacion } = propuesta.payload;
      const definition = createTypeFile(join(deps.vaultDir, "tipos"), {
        id: id ?? slugify(nombre),
        name: nombre,
        ...(descripcion === undefined ? {} : { description: descripcion }),
        attributes: toAttributes(atributos),
        ...(presentacion === undefined ? {} : { presentacion: { ...presentacion } }),
      });
      return { id: definition.id };
    }
  }
};

export const listarAcciones = (deps: AccionesDeps, estado?: EstadoAccion): Accion[] =>
  listarAccionesEnIndice(deps.db, estado === undefined ? {} : { estado }).map(toWire);

export const confirmarAccion = (deps: AccionesDeps, id: string): Accion => {
  const record = obtenerAccion(deps.db, id);
  if (record === undefined) {
    throw new ActionError("action_not_found");
  }
  if (record.estado !== "pendiente") {
    throw new ActionError("action_conflict");
  }
  let resultado: unknown;
  try {
    const propuesta = accionPropuestaSchema.parse(record);
    resultado = aplicarPropuesta(deps, propuesta);
  } catch (error) {
    actualizarEstadoAccion(deps.db, id, {
      estado: "error",
      detalle: sanitizeWatcherError(error, deps.vaultDir),
    });
    throw error;
  }
  return toWire(actualizarEstadoAccion(deps.db, id, { estado: "aplicada", resultado }));
};

export const rechazarAccion = (deps: AccionesDeps, id: string): void => {
  const record = obtenerAccion(deps.db, id);
  if (record === undefined) {
    throw new ActionError("action_not_found");
  }
  if (record.estado !== "pendiente") {
    throw new ActionError("action_conflict");
  }
  actualizarEstadoAccion(deps.db, id, { estado: "rechazada" });
};
