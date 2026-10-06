import { describe, expect, it } from "vitest";
import { searchParamsSchema } from "./search.js";

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
