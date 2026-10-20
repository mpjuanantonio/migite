import { describe, expect, it } from "vitest";
import {
  accionPropuestaSchema,
  guardarMemoriaPayloadSchema,
  tipoAccionSchema,
} from "./acciones.js";
import { actualizarMemoriaBodySchema, memoriaSchema, memoriasListSchema } from "./memories.js";

const MEMORIA = {
  id: "01JMEMORIA0000000000000000",
  clave: "color favorito",
  contenido: "azul",
  actualizada: "2026-10-16T10:00:00.000Z",
};

describe("memoriaSchema y memoriasListSchema", () => {
  it("valida una memoria y su listado", () => {
    const memoria = memoriaSchema.parse(MEMORIA);

    expect(memoria).toEqual(MEMORIA);
    expect(memoriasListSchema.parse({ memorias: [memoria] }).memorias).toHaveLength(1);
  });

  it("rechaza memorias incompletas o con campos extra", () => {
    expect(memoriaSchema.safeParse({ clave: "x", contenido: "y" }).success).toBe(false);
    expect(memoriaSchema.safeParse({ ...MEMORIA, extra: true }).success).toBe(false);
  });
});

describe("actualizarMemoriaBodySchema", () => {
  it("valida y normaliza el contenido", () => {
    expect(actualizarMemoriaBodySchema.parse({ contenido: "  nuevo  " }).contenido).toBe("nuevo");
  });

  it("rechaza un contenido vacío o con campos extra", () => {
    expect(actualizarMemoriaBodySchema.safeParse({ contenido: "   " }).success).toBe(false);
    expect(actualizarMemoriaBodySchema.safeParse({ contenido: "ok", clave: "x" }).success).toBe(
      false,
    );
  });
});

describe("cotas de guardar_memoria y actualizarMemoriaBodySchema", () => {
  it("acepta una clave de 100 caracteres y rechaza 101", () => {
    expect(
      guardarMemoriaPayloadSchema.safeParse({ clave: "c".repeat(100), contenido: "azul" }).success,
    ).toBe(true);
    expect(
      guardarMemoriaPayloadSchema.safeParse({ clave: "c".repeat(101), contenido: "azul" }).success,
    ).toBe(false);
  });

  it("acepta un contenido de 4000 caracteres y rechaza 4001", () => {
    expect(
      guardarMemoriaPayloadSchema.safeParse({ clave: "color", contenido: "a".repeat(4000) })
        .success,
    ).toBe(true);
    expect(
      guardarMemoriaPayloadSchema.safeParse({ clave: "color", contenido: "a".repeat(4001) })
        .success,
    ).toBe(false);
    expect(actualizarMemoriaBodySchema.safeParse({ contenido: "a".repeat(4000) }).success).toBe(
      true,
    );
    expect(actualizarMemoriaBodySchema.safeParse({ contenido: "a".repeat(4001) }).success).toBe(
      false,
    );
  });
});

describe("guardar_memoria en los contratos de acciones", () => {
  it("acepta el tipo de acción y valida su payload", () => {
    expect(tipoAccionSchema.parse("guardar_memoria")).toBe("guardar_memoria");
    expect(guardarMemoriaPayloadSchema.parse({ clave: "  color  ", contenido: " azul " })).toEqual({
      clave: "color",
      contenido: "azul",
    });
    expect(guardarMemoriaPayloadSchema.safeParse({ clave: "", contenido: "azul" }).success).toBe(
      false,
    );
    expect(guardarMemoriaPayloadSchema.safeParse({ clave: "color" }).success).toBe(false);
    expect(
      guardarMemoriaPayloadSchema.safeParse({ clave: "color", contenido: "azul", extra: 1 })
        .success,
    ).toBe(false);
  });

  it("valida la propuesta de guardar memoria", () => {
    const propuesta = accionPropuestaSchema.parse({
      id: "01JACCION000000000000000000",
      tipoAccion: "guardar_memoria",
      payload: { clave: "color favorito", contenido: "azul" },
      estado: "pendiente",
      creada: "2026-10-16T10:00:00.000Z",
    });

    expect(propuesta.tipoAccion).toBe("guardar_memoria");
    expect(propuesta.payload).toEqual({ clave: "color favorito", contenido: "azul" });
  });

  it("rechaza payloads que no corresponden con el tipo", () => {
    expect(
      accionPropuestaSchema.safeParse({
        id: "01JACCION000000000000000000",
        tipoAccion: "guardar_memoria",
        payload: { tipo: "nota", titulo: "x" },
        estado: "pendiente",
        creada: "2026-10-16T10:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
