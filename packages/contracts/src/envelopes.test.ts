import { describe, expect, it } from "vitest";
import {
  objetosPageSchema,
  saludSchema,
  sesionStatusSchema,
  tiposListSchema,
} from "./envelopes.js";

const objeto = {
  id: "01JALFA0000000000000000000",
  tipo: "nota",
  titulo: "Alfa",
  ruta: "alfa.md",
  carpeta: "",
  creado: "2026-10-05T09:00:00.000+02:00",
  actualizado: "2026-10-05T09:00:00.000+02:00",
  atributos: { etiquetas: ["prueba"] },
  cuerpo: "Contenido",
  enlaces: [],
  degraded: [],
};

const tipo = {
  id: "libro",
  nombre: "Libro",
  atributos: [{ id: "titulo", nombre: "Título", tipo: "texto", obligatorio: true }],
};

describe("objetosPageSchema", () => {
  it("accepts a page with objects and a nullable cursor", () => {
    const body = { objetos: [objeto], siguienteCursor: null };

    expect(objetosPageSchema.parse(body)).toEqual(body);
    expect(objetosPageSchema.parse({ objetos: [], siguienteCursor: "eyJvIjo1MA" })).toEqual({
      objetos: [],
      siguienteCursor: "eyJvIjo1MA",
    });
  });

  it("rejects a missing cursor, a non-array and invalid objects", () => {
    expect(objetosPageSchema.safeParse({ objetos: [] }).success).toBe(false);
    expect(objetosPageSchema.safeParse({ objetos: {}, siguienteCursor: null }).success).toBe(false);
    expect(
      objetosPageSchema.safeParse({ objetos: [{ id: objeto.id }], siguienteCursor: null }).success,
    ).toBe(false);
  });
});

describe("tiposListSchema", () => {
  it("accepts a type list", () => {
    const body = { tipos: [tipo] };

    expect(tiposListSchema.parse(body)).toEqual(body);
    expect(tiposListSchema.parse({ tipos: [] })).toEqual({ tipos: [] });
  });

  it("rejects a missing list and invalid types", () => {
    expect(tiposListSchema.safeParse({}).success).toBe(false);
    expect(tiposListSchema.safeParse({ tipos: [{ id: "libro" }] }).success).toBe(false);
    expect(tiposListSchema.safeParse({ tipos: "libro" }).success).toBe(false);
  });
});

describe("sesionStatusSchema", () => {
  it("accepts both session states with and without the setup flag", () => {
    expect(sesionStatusSchema.parse({ autenticado: true, setupRequerido: false })).toEqual({
      autenticado: true,
      setupRequerido: false,
    });
    expect(sesionStatusSchema.parse({ autenticado: false, setupRequerido: true })).toEqual({
      autenticado: false,
      setupRequerido: true,
    });
    expect(sesionStatusSchema.parse({ autenticado: true })).toEqual({ autenticado: true });
  });

  it("rejects a missing or non-boolean flag", () => {
    expect(sesionStatusSchema.safeParse({}).success).toBe(false);
    expect(sesionStatusSchema.safeParse({ autenticado: "si" }).success).toBe(false);
    expect(sesionStatusSchema.safeParse({ autenticado: true, setupRequerido: "no" }).success).toBe(
      false,
    );
  });
});

describe("saludSchema", () => {
  it("accepts healthy and degraded payloads, with and without version", () => {
    expect(
      saludSchema.parse({
        status: "ok",
        indice: { objetos: 3, listo: true, ultimoError: null },
      }),
    ).toEqual({ status: "ok", indice: { objetos: 3, listo: true, ultimoError: null } });
    expect(
      saludSchema.parse({
        status: "degradado",
        indice: { objetos: 0, listo: false, ultimoError: "fallo al indexar" },
        version: "0.1.0",
      }),
    ).toEqual({
      status: "degradado",
      indice: { objetos: 0, listo: false, ultimoError: "fallo al indexar" },
      version: "0.1.0",
    });
  });

  it("rejects unknown statuses and malformed index states", () => {
    expect(
      saludSchema.safeParse({
        status: "roto",
        indice: { objetos: 0, listo: true, ultimoError: null },
      }).success,
    ).toBe(false);
    expect(saludSchema.safeParse({ status: "ok" }).success).toBe(false);
    expect(
      saludSchema.safeParse({
        status: "ok",
        indice: { objetos: 1.5, listo: true, ultimoError: null },
      }).success,
    ).toBe(false);
    expect(
      saludSchema.safeParse({ status: "ok", indice: { objetos: 1, listo: true, ultimoError: 3 } })
        .success,
    ).toBe(false);
  });
});
