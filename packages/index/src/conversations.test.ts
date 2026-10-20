import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isUlid } from "@migite/core";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  borrarConversacion,
  crearConversacion,
  derivarTitulo,
  guardarMensaje,
  listarConversaciones,
  listarMensajes,
  type MensajeRol,
  obtenerConversacion,
  TITULO_CONVERSACION_MAX,
} from "./conversations.js";
import { IndexError, type IndexHandle, openIndex } from "./open.js";

const MISSING_ID = "01J00000000000000000000000";

let directory: string;
let handle: IndexHandle;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "migite-conversaciones-"));
  handle = openIndex({ dbPath: join(directory, "index.db") });
});

afterEach(() => {
  handle.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("crearConversacion", () => {
  it("stores a conversation with a ULID and an ISO timestamp", () => {
    const conversacion = crearConversacion(handle.db, { titulo: "  ¿Qué   tengo?  " });

    expect(isUlid(conversacion.id)).toBe(true);
    expect(conversacion.titulo).toBe("¿Qué tengo?");
    expect(new Date(conversacion.creada).toISOString()).toBe(conversacion.creada);
  });

  it("stores an empty title when none is given", () => {
    const conversacion = crearConversacion(handle.db);

    expect(conversacion.titulo).toBe("");
    expect(obtenerConversacion(handle.db, conversacion.id)?.titulo).toBe("");
  });
});

describe("listarConversaciones / obtenerConversacion", () => {
  it("lists conversations newest first", () => {
    const primera = crearConversacion(handle.db, { titulo: "Primera" });
    const segunda = crearConversacion(handle.db, { titulo: "Segunda" });

    expect(listarConversaciones(handle.db).map((conversacion) => conversacion.id)).toEqual([
      segunda.id,
      primera.id,
    ]);
    expect(obtenerConversacion(handle.db, primera.id)).toEqual(primera);
  });

  it("returns undefined for an unknown conversation", () => {
    expect(obtenerConversacion(handle.db, MISSING_ID)).toBeUndefined();
  });

  it("returns an empty list when there are none", () => {
    expect(listarConversaciones(handle.db)).toEqual([]);
  });
});

describe("guardarMensaje / listarMensajes", () => {
  it("stores messages in chronological order", () => {
    const conversacion = crearConversacion(handle.db);
    const usuario = guardarMensaje(handle.db, {
      conversacionId: conversacion.id,
      rol: "user",
      contenido: "hola",
    });
    const asistente = guardarMensaje(handle.db, {
      conversacionId: conversacion.id,
      rol: "assistant",
      contenido: "buenas",
    });

    expect(isUlid(usuario.id)).toBe(true);
    expect(new Date(usuario.creada).toISOString()).toBe(usuario.creada);
    expect(listarMensajes(handle.db, conversacion.id)).toEqual([usuario, asistente]);
  });

  it("derives the title from the first user message", () => {
    const conversacion = crearConversacion(handle.db);
    guardarMensaje(handle.db, {
      conversacionId: conversacion.id,
      rol: "assistant",
      contenido: "¿En qué te ayudo?",
    });

    expect(obtenerConversacion(handle.db, conversacion.id)?.titulo).toBe("");

    guardarMensaje(handle.db, {
      conversacionId: conversacion.id,
      rol: "user",
      contenido: "  ¿Qué   tengo\n pendiente?  ",
    });

    expect(obtenerConversacion(handle.db, conversacion.id)?.titulo).toBe("¿Qué tengo pendiente?");
  });

  it("does not overwrite an existing title", () => {
    const conversacion = crearConversacion(handle.db, { titulo: "Título fijo" });
    guardarMensaje(handle.db, {
      conversacionId: conversacion.id,
      rol: "user",
      contenido: "otro mensaje",
    });

    expect(obtenerConversacion(handle.db, conversacion.id)?.titulo).toBe("Título fijo");
  });

  it("truncates a long derived title", () => {
    const conversacion = crearConversacion(handle.db);
    const largo = "palabra ".repeat(40);
    guardarMensaje(handle.db, {
      conversacionId: conversacion.id,
      rol: "user",
      contenido: largo,
    });

    const titulo = obtenerConversacion(handle.db, conversacion.id)?.titulo ?? "";
    expect(titulo.endsWith("…")).toBe(true);
    expect(titulo.length).toBeLessThanOrEqual(TITULO_CONVERSACION_MAX + 1);
    expect(derivarTitulo(largo)).toBe(titulo);
  });

  it("rejects an unknown conversation and an invalid role", () => {
    expect(() =>
      guardarMensaje(handle.db, {
        conversacionId: MISSING_ID,
        rol: "user",
        contenido: "hola",
      }),
    ).toThrow(IndexError);

    const conversacion = crearConversacion(handle.db);
    expect(() =>
      guardarMensaje(handle.db, {
        conversacionId: conversacion.id,
        rol: "tool" as MensajeRol,
        contenido: "hola",
      }),
    ).toThrow(IndexError);
  });

  it("rejects a role read from the database that is not known", () => {
    const conversacion = crearConversacion(handle.db);
    const mensaje = guardarMensaje(handle.db, {
      conversacionId: conversacion.id,
      rol: "user",
      contenido: "hola",
    });
    handle.db.run(sql`UPDATE mensajes SET rol = 'system' WHERE id = ${mensaje.id}`);

    expect(() => listarMensajes(handle.db, conversacion.id)).toThrow(IndexError);
  });

  it("returns an empty transcript for an unknown conversation", () => {
    expect(listarMensajes(handle.db, MISSING_ID)).toEqual([]);
  });
});

describe("borrarConversacion", () => {
  it("deletes the conversation and its messages", () => {
    const conversacion = crearConversacion(handle.db, { titulo: "Borrable" });
    guardarMensaje(handle.db, {
      conversacionId: conversacion.id,
      rol: "user",
      contenido: "hola",
    });

    expect(borrarConversacion(handle.db, conversacion.id)).toBe(true);
    expect(obtenerConversacion(handle.db, conversacion.id)).toBeUndefined();
    expect(listarMensajes(handle.db, conversacion.id)).toEqual([]);
  });

  it("returns false for an unknown conversation", () => {
    expect(borrarConversacion(handle.db, MISSING_ID)).toBe(false);
  });
});
