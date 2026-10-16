import { describe, expect, it } from "vitest";
import { chatMensajeBodySchema, chatStreamEventSchema, LIMITE_MENSAJE_CHAT } from "./chat.js";

describe("chatMensajeBodySchema", () => {
  it("accepts a message with and without a conversation id", () => {
    expect(chatMensajeBodySchema.parse({ mensaje: "hola" })).toEqual({ mensaje: "hola" });
    expect(
      chatMensajeBodySchema.parse({
        conversacionId: "01JCONVERSACION0000000000000",
        mensaje: "¿qué tengo pendiente?",
      }),
    ).toEqual({
      conversacionId: "01JCONVERSACION0000000000000",
      mensaje: "¿qué tengo pendiente?",
    });
  });

  it("trims the message and rejects empty or oversized ones", () => {
    expect(chatMensajeBodySchema.parse({ mensaje: "  hola  " }).mensaje).toBe("hola");
    expect(chatMensajeBodySchema.safeParse({ mensaje: "" }).success).toBe(false);
    expect(chatMensajeBodySchema.safeParse({ mensaje: "   " }).success).toBe(false);
    expect(
      chatMensajeBodySchema.safeParse({ mensaje: "x".repeat(LIMITE_MENSAJE_CHAT + 1) }).success,
    ).toBe(false);
    expect(
      chatMensajeBodySchema.safeParse({ mensaje: "x".repeat(LIMITE_MENSAJE_CHAT) }).success,
    ).toBe(true);
  });

  it("rejects an empty conversation id", () => {
    expect(
      chatMensajeBodySchema.safeParse({ conversacionId: "   ", mensaje: "hola" }).success,
    ).toBe(false);
  });

  it("no longer accepts the client history", () => {
    expect(
      chatMensajeBodySchema.safeParse({
        mensaje: "hola",
        historial: [
          { role: "user", content: "hola" },
          { role: "assistant", content: "buenas" },
        ],
      }).success,
    ).toBe(false);
    expect(chatMensajeBodySchema.safeParse({ mensaje: "hola", historial: "x" }).success).toBe(
      false,
    );
  });

  it("rejects unknown fields", () => {
    expect(chatMensajeBodySchema.safeParse({ mensaje: "hola", locale: "es" }).success).toBe(false);
  });
});

describe("chatStreamEventSchema", () => {
  it("accepts every event type", () => {
    expect(chatStreamEventSchema.parse({ tipo: "delta", texto: "hola" })).toEqual({
      tipo: "delta",
      texto: "hola",
    });
    expect(
      chatStreamEventSchema.parse({ tipo: "herramienta", nombre: "leer_objeto", isError: false }),
    ).toEqual({ tipo: "herramienta", nombre: "leer_objeto", isError: false });
    const fin = {
      tipo: "fin",
      contenido: "listo",
      pasos: 2,
      estado: "completado",
      conversacionId: "01JCONVERSACION0000000000000",
      accionesPropuestas: [
        {
          id: "01JACCION00000000000000000",
          tipoAccion: "crear_objeto",
          payload: { titulo: "Nota" },
          estado: "pendiente",
          creada: "2026-10-16T10:00:00.000+02:00",
        },
      ],
    };
    expect(chatStreamEventSchema.parse(fin)).toEqual(fin);
    expect(chatStreamEventSchema.parse({ tipo: "error", mensaje: "falló" })).toEqual({
      tipo: "error",
      mensaje: "falló",
    });
  });

  it("rejects unknown types and malformed payloads", () => {
    expect(chatStreamEventSchema.safeParse({ tipo: "fin" }).success).toBe(false);
    expect(chatStreamEventSchema.safeParse({ tipo: "desconocido" }).success).toBe(false);
    expect(chatStreamEventSchema.safeParse({ tipo: "delta", texto: 10 }).success).toBe(false);
    expect(
      chatStreamEventSchema.safeParse({ tipo: "herramienta", nombre: "x", isError: "no" }).success,
    ).toBe(false);
    expect(
      chatStreamEventSchema.safeParse({
        tipo: "fin",
        contenido: "listo",
        pasos: -1,
        estado: "completado",
        accionesPropuestas: [],
      }).success,
    ).toBe(false);
    expect(
      chatStreamEventSchema.safeParse({
        tipo: "fin",
        contenido: "listo",
        pasos: 1,
        estado: "otro",
        accionesPropuestas: [],
      }).success,
    ).toBe(false);
    expect(chatStreamEventSchema.safeParse({ tipo: "error", mensaje: 10 }).success).toBe(false);
  });
});
