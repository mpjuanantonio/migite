import { newUlid } from "@migite/core";
import { and, desc, eq } from "drizzle-orm";
import { type IndexDatabase, IndexError } from "./open.js";
import { acciones } from "./schema.js";

export const ACCION_ESTADOS = ["pendiente", "aplicada", "rechazada", "error"] as const;

export type AccionEstado = (typeof ACCION_ESTADOS)[number];

export class AccionConflictoError extends IndexError {
  readonly esperado: AccionEstado;
  readonly estadoActual: string;

  constructor(id: string, esperado: AccionEstado, estadoActual: string) {
    super(
      `La acción "${id}" ya no está en estado "${esperado}": su estado actual es "${estadoActual}".`,
    );
    this.name = "AccionConflictoError";
    this.esperado = esperado;
    this.estadoActual = estadoActual;
  }
}

export type AccionRecord = {
  readonly id: string;
  readonly tipoAccion: string;
  readonly payload: unknown;
  readonly estado: AccionEstado;
  readonly creada: string;
  readonly detalle?: string;
  readonly resultado?: unknown;
};

export type CrearAccionInput = {
  readonly tipoAccion: string;
  readonly payload: unknown;
};

export type ListarAccionesOptions = {
  readonly estado?: AccionEstado;
};

export type ActualizarEstadoAccionInput = {
  readonly estado: AccionEstado;
  readonly detalle?: string;
  readonly resultado?: unknown;
  readonly desde?: AccionEstado;
};

type AccionRow = {
  readonly id: string;
  readonly tipoAccion: string;
  readonly payload: string;
  readonly estado: string;
  readonly detalle: string | null;
  readonly resultado: string | null;
  readonly creada: string;
};

const isAccionEstado = (value: string): value is AccionEstado =>
  (ACCION_ESTADOS as readonly string[]).includes(value);

const serialize = (value: unknown, id: string, field: string): string => {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch (error) {
    throw new IndexError(`No se pudo serializar el campo "${field}" de la acción "${id}".`, {
      cause: error,
    });
  }
  if (text === undefined) {
    throw new IndexError(`No se pudo serializar el campo "${field}" de la acción "${id}".`);
  }
  return text;
};

const deserialize = (text: string, id: string, field: string): unknown => {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new IndexError(`El campo "${field}" de la acción "${id}" no es JSON válido.`, {
      cause: error,
    });
  }
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

const canonicalPayloadKey = (text: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(text);
    return stableStringify(parsed);
  } catch {
    return undefined;
  }
};

const toRecord = (row: AccionRow): AccionRecord => {
  if (!isAccionEstado(row.estado)) {
    throw new IndexError(`La acción "${row.id}" tiene un estado desconocido: "${row.estado}".`);
  }
  return {
    id: row.id,
    tipoAccion: row.tipoAccion,
    payload: deserialize(row.payload, row.id, "payload"),
    estado: row.estado,
    creada: row.creada,
    ...(row.detalle === null ? {} : { detalle: row.detalle }),
    ...(row.resultado === null
      ? {}
      : { resultado: deserialize(row.resultado, row.id, "resultado") }),
  };
};

export const crearAccion = (db: IndexDatabase, input: CrearAccionInput): AccionRecord => {
  const tipoAccion = input.tipoAccion.trim();
  if (tipoAccion.length === 0) {
    throw new IndexError("El tipo de acción no puede estar vacío.");
  }
  const id = newUlid();
  const creada = new Date().toISOString();
  const payloadTexto = serialize(input.payload, id, "payload");
  const clave = canonicalPayloadKey(payloadTexto);
  const pendientes =
    clave === undefined
      ? []
      : db
          .select()
          .from(acciones)
          .where(and(eq(acciones.tipoAccion, tipoAccion), eq(acciones.estado, "pendiente")))
          .all();
  const existente = pendientes.find((row) => canonicalPayloadKey(row.payload) === clave);
  if (existente !== undefined) {
    return toRecord(existente);
  }
  db.insert(acciones)
    .values({
      id,
      tipoAccion,
      payload: payloadTexto,
      estado: "pendiente",
      detalle: null,
      resultado: null,
      creada,
    })
    .run();
  return { id, tipoAccion, payload: input.payload, estado: "pendiente", creada };
};

export const listarAcciones = (
  db: IndexDatabase,
  options: ListarAccionesOptions = {},
): AccionRecord[] => {
  if (options.estado === undefined) {
    return db
      .select()
      .from(acciones)
      .orderBy(desc(acciones.creada), desc(acciones.id))
      .all()
      .map(toRecord);
  }
  return db
    .select()
    .from(acciones)
    .where(eq(acciones.estado, options.estado))
    .orderBy(desc(acciones.creada), desc(acciones.id))
    .all()
    .map(toRecord);
};

export const obtenerAccion = (db: IndexDatabase, id: string): AccionRecord | undefined => {
  const row = db.select().from(acciones).where(eq(acciones.id, id)).get();
  return row === undefined ? undefined : toRecord(row);
};

export const actualizarEstadoAccion = (
  db: IndexDatabase,
  id: string,
  input: ActualizarEstadoAccionInput,
): AccionRecord => {
  const result = db
    .update(acciones)
    .set({
      estado: input.estado,
      detalle: input.detalle ?? null,
      resultado: input.resultado === undefined ? null : serialize(input.resultado, id, "resultado"),
    })
    .where(
      input.desde === undefined
        ? eq(acciones.id, id)
        : and(eq(acciones.id, id), eq(acciones.estado, input.desde)),
    )
    .run();
  if (result.changes === 0) {
    const current = db
      .select({ estado: acciones.estado })
      .from(acciones)
      .where(eq(acciones.id, id))
      .get();
    if (current === undefined) {
      throw new IndexError(`La acción "${id}" no existe.`);
    }
    if (input.desde !== undefined) {
      throw new AccionConflictoError(id, input.desde, current.estado);
    }
    throw new IndexError(`No se pudo actualizar la acción "${id}".`);
  }
  const updated = obtenerAccion(db, id);
  if (updated === undefined) {
    throw new IndexError(`La acción "${id}" no existe.`);
  }
  return updated;
};
