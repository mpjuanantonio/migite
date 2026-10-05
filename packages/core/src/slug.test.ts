import { describe, expect, it } from "vitest";
import { slugify } from "./slug.js";

describe("slugify", () => {
  it("lowercases and drops accents", () => {
    expect(slugify("Migite")).toBe("migite");
    expect(slugify("Ñandú Ñandú")).toBe("nandu-nandu");
    expect(slugify("¿Cómo estás?")).toBe("como-estas");
    expect(slugify("Año 2026")).toBe("ano-2026");
  });

  it("replaces spaces and symbols with single dashes", () => {
    expect(slugify("  Presupuesto   2026  ")).toBe("presupuesto-2026");
    expect(slugify("Llamar//al banco")).toBe("llamar-al-banco");
    expect(slugify("casa: llave nueva")).toBe("casa-llave-nueva");
    expect(slugify("---ya con guiones---")).toBe("ya-con-guiones");
  });

  it("keeps digits and ascii letters", () => {
    expect(slugify("Factura #42 (octubre)")).toBe("factura-42-octubre");
    expect(slugify("abcXYZ123")).toBe("abcxyz123");
  });

  it("returns an empty string for empty or symbol only titles", () => {
    expect(slugify("")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("!!!")).toBe("");
  });
});
