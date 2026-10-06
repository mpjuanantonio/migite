import { describe, expect, it } from "vitest";
import { LIMITE_MAX, LIMITE_MIN, paginationSchema } from "./pagination.js";

describe("paginationSchema", () => {
  it("accepts empty pagination", () => {
    expect(paginationSchema.parse({})).toEqual({});
  });

  it("accepts the limit bounds", () => {
    expect(paginationSchema.parse({ limite: LIMITE_MIN }).limite).toBe(LIMITE_MIN);
    expect(paginationSchema.parse({ limite: LIMITE_MAX }).limite).toBe(LIMITE_MAX);
  });

  it("accepts an opaque cursor", () => {
    expect(paginationSchema.parse({ cursor: "eyJpZCI6MX0=" }).cursor).toBe("eyJpZCI6MX0=");
  });

  it("rejects a limit out of range", () => {
    expect(paginationSchema.safeParse({ limite: 0 }).success).toBe(false);
    expect(paginationSchema.safeParse({ limite: 501 }).success).toBe(false);
    expect(paginationSchema.safeParse({ limite: -3 }).success).toBe(false);
  });

  it("rejects a non integer or non numeric limit", () => {
    expect(paginationSchema.safeParse({ limite: 1.5 }).success).toBe(false);
    expect(paginationSchema.safeParse({ limite: "10" }).success).toBe(false);
  });

  it("rejects a non string cursor", () => {
    expect(paginationSchema.safeParse({ cursor: 10 }).success).toBe(false);
  });
});
