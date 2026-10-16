import { newUlid } from "@migite/core";
import { asc, eq } from "drizzle-orm";
import { type IndexDatabase, IndexError } from "./open.js";
import { memorias } from "./schema.js";

export type MemoriaRecord = {
  readonly id: string;
  readonly clave: string;
  readonly contenido: string;
  readonly actualizada: string;
};

export type GuardarMemoriaInput = {
  readonly clave: string;
  readonly contenido: string;
};

export type ActualizarMemoriaInput = {
  readonly contenido: string;
};

const normalizarClave = (clave: string): string => {
  const normalizada = clave.trim();
  if (normalizada.length === 0) {
    throw new IndexError("La clave de la memoria no puede estar vacía.");
  }
  return normalizada;
};

const normalizarContenido = (contenido: string): string => {
  const normalizado = contenido.trim();
  if (normalizado.length === 0) {
    throw new IndexError("El contenido de la memoria no puede estar vacío.");
  }
  return normalizado;
};

export const guardarMemoria = (db: IndexDatabase, input: GuardarMemoriaInput): MemoriaRecord => {
  const clave = normalizarClave(input.clave);
  const contenido = normalizarContenido(input.contenido);
  const actualizada = new Date().toISOString();
  const existente = db.select().from(memorias).where(eq(memorias.clave, clave)).get();
  if (existente === undefined) {
    const id = newUlid();
    db.insert(memorias).values({ id, clave, contenido, actualizada }).run();
    return { id, clave, contenido, actualizada };
  }
  db.update(memorias).set({ contenido, actualizada }).where(eq(memorias.id, existente.id)).run();
  return { id: existente.id, clave, contenido, actualizada };
};

export const listarMemorias = (db: IndexDatabase): MemoriaRecord[] =>
  db
    .select()
    .from(memorias)
    .orderBy(asc(memorias.clave), asc(memorias.id))
    .all()
    .map((row) => ({
      id: row.id,
      clave: row.clave,
      contenido: row.contenido,
      actualizada: row.actualizada,
    }));

export const obtenerMemoria = (db: IndexDatabase, id: string): MemoriaRecord | undefined => {
  const row = db.select().from(memorias).where(eq(memorias.id, id)).get();
  return row === undefined
    ? undefined
    : { id: row.id, clave: row.clave, contenido: row.contenido, actualizada: row.actualizada };
};

export const actualizarMemoria = (
  db: IndexDatabase,
  id: string,
  input: ActualizarMemoriaInput,
): MemoriaRecord => {
  const contenido = normalizarContenido(input.contenido);
  const actualizada = new Date().toISOString();
  const result = db
    .update(memorias)
    .set({ contenido, actualizada })
    .where(eq(memorias.id, id))
    .run();
  if (result.changes === 0) {
    throw new IndexError(`La memoria "${id}" no existe.`);
  }
  const updated = obtenerMemoria(db, id);
  if (updated === undefined) {
    throw new IndexError(`La memoria "${id}" no existe.`);
  }
  return updated;
};

export const borrarMemoria = (db: IndexDatabase, id: string): boolean => {
  const result = db.delete(memorias).where(eq(memorias.id, id)).run();
  return result.changes > 0;
};
