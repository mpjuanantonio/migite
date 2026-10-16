import { describe, expect, it } from "vitest";
import {
  conversacionesListSchema,
  conversacionSchema,
  mensajeSchema,
  mensajesListSchema,
} from "./conversations.js";

const conversacion = {
  id: "01JCONVERSACION0000000000000",
  titulo: "¿Qué tengo pendiente?",
  creada: "2026-10-16T10:00:00.000+02:00",
};

describe("conversacionSchema", () => {
  it("accepts a conversation and a list of conversations", () => {
    expect(conversacionSchema.parse(conversacion)).toEqual(conversacion);
    expect(conversacionesListSchema.parse({ conversaciones: [conversacion] })).toEqual({
      conversaciones: [conversacion],
    });
    expect(conversacionesListSchema.parse({ conversaciones: [] })).toEqual({ conversaciones: [] });
  });

  it("rejects missing fields and unknown fields", () => {
    expect(conversacionSchema.safeParse({ id: conversacion.id }).success).toBe(false);
    expect(conversacionSchema.safeParse({ ...conversacion, extra: true }).success).toBe(false);
    expect(conversacionesListSchema.safeParse({}).success).toBe(false);
  });
});

describe("mensajeSchema", () => {
  const mensaje = {
    id: "01JMENSAJE00000000000000000",
    rol: "assistant",
    contenido: "No hay objetos.",
    creada: "2026-10-16T10:00:01.000+02:00",
  };

  it("accepts a message and a list of messages", () => {
    expect(mensajeSchema.parse(mensaje)).toEqual(mensaje);
    expect(mensajeSchema.parse({ ...mensaje, rol: "user", contenido: "" }).rol).toBe("user");
    expect(mensajesListSchema.parse({ mensajes: [mensaje] })).toEqual({ mensajes: [mensaje] });
  });

  it("rejects unknown roles and unknown fields", () => {
    expect(mensajeSchema.safeParse({ ...mensaje, rol: "tool" }).success).toBe(false);
    expect(mensajeSchema.safeParse({ ...mensaje, extra: true }).success).toBe(false);
    expect(mensajesListSchema.safeParse({ mensajes: [{}] }).success).toBe(false);
  });
});
