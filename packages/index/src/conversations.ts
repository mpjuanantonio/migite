import { newUlid } from "@migite/core";
import { asc, desc, eq } from "drizzle-orm";
import { type IndexDatabase, IndexError } from "./open.js";
import { conversaciones, mensajes } from "./schema.js";

export const MENSAJE_ROLES = ["user", "assistant"] as const;

export type MensajeRol = (typeof MENSAJE_ROLES)[number];

export const TITULO_CONVERSACION_MAX = 80;

export type ConversacionRecord = {
  readonly id: string;
  readonly titulo: string;
  readonly creada: string;
};

export type MensajeRecord = {
  readonly id: string;
  readonly rol: MensajeRol;
  readonly contenido: string;
  readonly creada: string;
};

export type CrearConversacionInput = {
  readonly titulo?: string;
};

export type GuardarMensajeInput = {
  readonly conversacionId: string;
  readonly rol: MensajeRol;
  readonly contenido: string;
};

type ConversacionRow = {
  readonly id: string;
  readonly titulo: string | null;
  readonly creada: string;
};

type MensajeRow = {
  readonly id: string;
  readonly rol: string;
  readonly contenido: string;
  readonly creada: string;
};

const isMensajeRol = (value: string): value is MensajeRol =>
  (MENSAJE_ROLES as readonly string[]).includes(value);

const normalizarTexto = (texto: string): string => texto.replace(/\s+/g, " ").trim();

const recortarTitulo = (texto: string): string =>
  texto.length <= TITULO_CONVERSACION_MAX
    ? texto
    : `${texto.slice(0, TITULO_CONVERSACION_MAX).trimEnd()}…`;

export const derivarTitulo = (contenido: string): string =>
  recortarTitulo(normalizarTexto(contenido));

const toConversacion = (row: ConversacionRow): ConversacionRecord => ({
  id: row.id,
  titulo: row.titulo ?? "",
  creada: row.creada,
});

const toMensaje = (row: MensajeRow): MensajeRecord => {
  if (!isMensajeRol(row.rol)) {
    throw new IndexError(`El mensaje "${row.id}" tiene un rol desconocido: "${row.rol}".`);
  }
  return {
    id: row.id,
    rol: row.rol,
    contenido: row.contenido,
    creada: row.creada,
  };
};

export const crearConversacion = (
  db: IndexDatabase,
  input: CrearConversacionInput = {},
): ConversacionRecord => {
  const id = newUlid();
  const creada = new Date().toISOString();
  const titulo = input.titulo === undefined ? "" : derivarTitulo(input.titulo);
  db.insert(conversaciones)
    .values({ id, titulo: titulo === "" ? null : titulo, creada })
    .run();
  return { id, titulo, creada };
};

export const listarConversaciones = (db: IndexDatabase): ConversacionRecord[] =>
  db
    .select()
    .from(conversaciones)
    .orderBy(desc(conversaciones.creada), desc(conversaciones.id))
    .all()
    .map(toConversacion);

export const obtenerConversacion = (
  db: IndexDatabase,
  id: string,
): ConversacionRecord | undefined => {
  const row = db.select().from(conversaciones).where(eq(conversaciones.id, id)).get();
  return row === undefined ? undefined : toConversacion(row);
};

export const guardarMensaje = (db: IndexDatabase, input: GuardarMensajeInput): MensajeRecord => {
  if (!isMensajeRol(input.rol)) {
    throw new IndexError(`El rol del mensaje no es válido: "${input.rol}".`);
  }
  const conversacion = obtenerConversacion(db, input.conversacionId);
  if (conversacion === undefined) {
    throw new IndexError(`La conversación "${input.conversacionId}" no existe.`);
  }
  const id = newUlid();
  const creada = new Date().toISOString();
  db.insert(mensajes)
    .values({
      id,
      conversacionId: input.conversacionId,
      rol: input.rol,
      contenido: input.contenido,
      creada,
    })
    .run();
  if (input.rol === "user" && conversacion.titulo === "") {
    const titulo = derivarTitulo(input.contenido);
    if (titulo !== "") {
      db.update(conversaciones)
        .set({ titulo })
        .where(eq(conversaciones.id, input.conversacionId))
        .run();
    }
  }
  return { id, rol: input.rol, contenido: input.contenido, creada };
};

export const listarMensajes = (db: IndexDatabase, conversacionId: string): MensajeRecord[] =>
  db
    .select()
    .from(mensajes)
    .where(eq(mensajes.conversacionId, conversacionId))
    .orderBy(asc(mensajes.creada), asc(mensajes.id))
    .all()
    .map(toMensaje);

export const borrarConversacion = (db: IndexDatabase, id: string): boolean => {
  db.delete(mensajes).where(eq(mensajes.conversacionId, id)).run();
  const result = db.delete(conversaciones).where(eq(conversaciones.id, id)).run();
  return result.changes > 0;
};
