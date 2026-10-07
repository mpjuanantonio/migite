import { describe, expect, it } from "vitest";
import {
  MAX_ATRIBUTOS_FILTRO,
  MAX_RANGOS_ATRIBUTO,
  MAX_VALOR_FILTRO,
  MAX_VALORES_ATRIBUTO,
  searchParamsSchema,
  searchResultsSchema,
} from "./search.js";

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
      enlazadoA: "01JALFA0000000000000000000",
      cursor: "eyJpZCI6MX0=",
    };

    expect(searchParamsSchema.parse(params)).toEqual(params);
  });

  it("parses attribute filters and list membership", () => {
    expect(searchParamsSchema.parse({ "atributo.estado": "pendiente" })).toEqual({
      atributos: { estado: ["pendiente"] },
    });
    expect(searchParamsSchema.parse({ "atributo.etiquetas": ["trabajo", "urgente"] })).toEqual({
      atributos: { etiquetas: ["trabajo", "urgente"] },
    });
    expect(
      searchParamsSchema.parse({
        "atributo.estado": "en curso",
        "atributo.etiquetas": ["trabajo", "urgente"],
        tipo: "tarea",
      }),
    ).toEqual({
      tipo: "tarea",
      atributos: { estado: ["en curso"], etiquetas: ["trabajo", "urgente"] },
    });
  });

  it("parses attribute ranges", () => {
    expect(
      searchParamsSchema.parse({
        "rango.inicio.desde": "2026-01-01T00:00:00.000Z",
        "rango.inicio.hasta": "2026-12-31T23:59:59.999Z",
        "rango.fin.desde": "2026-06-01T00:00:00.000Z",
      }),
    ).toEqual({
      rangoAtributo: [
        {
          clave: "inicio",
          desde: "2026-01-01T00:00:00.000Z",
          hasta: "2026-12-31T23:59:59.999Z",
        },
        { clave: "fin", desde: "2026-06-01T00:00:00.000Z" },
      ],
    });
  });

  it("rejects malformed attribute filters", () => {
    expect(searchParamsSchema.safeParse({ "atributo.": "x" }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ "atributo.a.b": "x" }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ [`atributo.${"a".repeat(65)}`]: "x" }).success).toBe(
      false,
    );
    expect(searchParamsSchema.safeParse({ "atributo.estado": 10 }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ "atributo.estado": [1] }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ "atributo.estado": [] }).success).toBe(false);
    expect(
      searchParamsSchema.safeParse({ "atributo.estado": "x".repeat(MAX_VALOR_FILTRO + 1) }).success,
    ).toBe(false);
  });

  it("limits the number of attribute filters", () => {
    const attributes: Record<string, string> = {};
    for (let index = 0; index < MAX_ATRIBUTOS_FILTRO; index += 1) {
      attributes[`atributo.clave${index}`] = "valor";
    }
    expect(searchParamsSchema.safeParse(attributes).success).toBe(true);
    expect(searchParamsSchema.safeParse({ ...attributes, "atributo.extra": "valor" }).success).toBe(
      false,
    );

    const many = Array.from({ length: MAX_VALORES_ATRIBUTO }, (_, index) => `valor${index}`);
    expect(searchParamsSchema.safeParse({ "atributo.estado": many }).success).toBe(true);
    expect(searchParamsSchema.safeParse({ "atributo.estado": [...many, "extra"] }).success).toBe(
      false,
    );
  });

  it("rejects malformed attribute ranges", () => {
    expect(searchParamsSchema.safeParse({ "rango.inicio": "x" }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ "rango.inicio.otro": "x" }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ "rango..desde": "x" }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ "rango.inicio.desde": ["a", "b"] }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ "rango.inicio.desde": 1 }).success).toBe(false);
    expect(
      searchParamsSchema.safeParse({
        "rango.inicio.desde": "x".repeat(MAX_VALOR_FILTRO + 1),
      }).success,
    ).toBe(false);
  });

  it("limits the number of attribute ranges", () => {
    const ranges: Record<string, string> = {};
    for (let index = 0; index < MAX_RANGOS_ATRIBUTO; index += 1) {
      ranges[`rango.clave${index}.desde`] = "2026-01-01T00:00:00.000Z";
    }
    expect(searchParamsSchema.safeParse(ranges).success).toBe(true);
    expect(searchParamsSchema.safeParse({ ...ranges, "rango.extra.desde": "x" }).success).toBe(
      false,
    );
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
