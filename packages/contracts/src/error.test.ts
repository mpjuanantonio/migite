import { describe, expect, it } from "vitest";
import { errorBodySchema } from "./error.js";

describe("errorBodySchema", () => {
  it("accepts a valid error body", () => {
    const body = {
      error: { codigo: "objeto_no_encontrado", mensaje: "Objeto no encontrado" },
    };

    expect(errorBodySchema.parse(body)).toEqual(body);
  });

  it("rejects a missing mensaje", () => {
    expect(errorBodySchema.safeParse({ error: { codigo: "x" } }).success).toBe(false);
  });

  it("rejects empty texts", () => {
    expect(errorBodySchema.safeParse({ error: { codigo: "  ", mensaje: "x" } }).success).toBe(
      false,
    );
    expect(errorBodySchema.safeParse({ error: { codigo: "x", mensaje: "" } }).success).toBe(false);
  });

  it("rejects a non object error", () => {
    expect(errorBodySchema.safeParse({ error: "x" }).success).toBe(false);
    expect(errorBodySchema.safeParse({}).success).toBe(false);
  });
});
