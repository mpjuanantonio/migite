import { describe, expect, it } from "vitest";
import {
  chatMensajeBodySchema,
  chatStreamEventSchema,
  LIMITE_HISTORIAL_CHAT,
  LIMITE_MENSAJE_CHAT,
} from "./chat.js";

describe("chatMensajeBodySchema", () => {
  it("accepts a message with and without history", () => {
    expect(chatMensajeBodySchema.parse({ mensaje: "hola" })).toEqual({ mensaje: "hola" });
    const body = {
      mensaje: "¿qué tengo pendiente?",
      historial: [
        { role: "user", content: "hola" },
        { role: "assistant", content: "buenas" },
      ],
    };
    expect(chatMensajeBodySchema.parse(body)).toEqual(body);
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

  it("limits the history length", () => {
    const historial = Array.from({ length: LIMITE_HISTORIAL_CHAT }, () => ({
      role: "user" as const,
      content: "hola",
    }));
    expect(chatMensajeBodySchema.safeParse({ mensaje: "sigue", historial }).success).toBe(true);
    expect(
      chatMensajeBodySchema.safeParse({
        mensaje: "sigue",
        historial: [...historial, { role: "assistant", content: "hola" }],
      }).success,
    ).toBe(false);
  });

  it("rejects invalid roles and unknown fields", () => {
    expect(
      chatMensajeBodySchema.safeParse({
        mensaje: "hola",
        historial: [{ role: "tool", content: "x" }],
      }).success,
    ).toBe(false);
    expect(
      chatMensajeBodySchema.safeParse({
        mensaje: "hola",
        historial: [{ role: "user", content: 10 }],
      }).success,
    ).toBe(false);
    expect(chatMensajeBodySchema.safeParse({ mensaje: "hola", locale: "es" }).success).toBe(false);
    expect(chatMensajeBodySchema.safeParse({ mensaje: "hola", historial: "x" }).success).toBe(
      false,
    );
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
