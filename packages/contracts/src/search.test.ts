import { describe, expect, it } from "vitest";
import { searchParamsSchema, searchResultsSchema } from "./search.js";

describe("searchParamsSchema", () => {
  it("accepts empty params", () => {
    expect(searchParamsSchema.parse({})).toEqual({});
  });

  it("accepts every filter", () => {
    const params = {
      q: "nota",
      tipo: "tarea",
      carpeta: "proyectos",
      tag: "urgente",
      desde: "2026-01-01",
      hasta: "2026-12-31",
      cursor: "eyJpZCI6MX0=",
    };

    expect(searchParamsSchema.parse(params)).toEqual(params);
  });

  it("coerces limite from query strings", () => {
    expect(searchParamsSchema.parse({ limite: "50" }).limite).toBe(50);
    expect(searchParamsSchema.parse({ limite: "500" }).limite).toBe(500);
  });

  it("rejects limits out of range or not numeric", () => {
    expect(searchParamsSchema.safeParse({ limite: "0" }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ limite: "501" }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ limite: "1.5" }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ limite: "muchas" }).success).toBe(false);
  });

  it("rejects filters with the wrong type", () => {
    expect(searchParamsSchema.safeParse({ q: 10 }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ cursor: 10 }).success).toBe(false);
  });

  it("ignores unknown query params", () => {
    expect(searchParamsSchema.parse({ otro: "x" })).toEqual({});
  });
});

describe("searchResultsSchema", () => {
  const item = {
    id: "01JALFA0000000000000000000",
    tipo: "nota",
    titulo: "Alfa",
    ruta: "alfa.md",
    actualizado: "2026-10-05T09:00:00.000+02:00",
  };

  it("accepts results with and without a snippet", () => {
    const body = {
      resultados: [item, { ...item, id: "01JBETA0000000000000000000", fragmento: "…proyecto…" }],
      siguienteCursor: null,
    };

    expect(searchResultsSchema.parse(body)).toEqual(body);
  });

  it("accepts an opaque next cursor", () => {
    expect(searchResultsSchema.parse({ resultados: [], siguienteCursor: "eyJvIjoyfQ" })).toEqual({
      resultados: [],
      siguienteCursor: "eyJvIjoyfQ",
    });
  });

  it("rejects missing fields and wrong types", () => {
    expect(searchResultsSchema.safeParse({ resultados: [] }).success).toBe(false);
    expect(searchResultsSchema.safeParse({ resultados: [item] }).success).toBe(false);
    expect(
      searchResultsSchema.safeParse({ resultados: [{ id: item.id }], siguienteCursor: null })
        .success,
    ).toBe(false);
    expect(
      searchResultsSchema.safeParse({
        resultados: [{ ...item, fragmento: 10 }],
        siguienteCursor: null,
      }).success,
    ).toBe(false);
  });
});
