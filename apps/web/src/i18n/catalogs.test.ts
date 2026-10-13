import { describe, expect, it } from "vitest";
import { type WebTranslationKey, webCatalogs } from "./catalogs";

const placeholdersDe = (plantilla: string): readonly string[] =>
  [...plantilla.matchAll(/\{(\w+)\}/g)].map((coincidencia) => coincidencia[1] ?? "").sort();

const claves = Object.keys(webCatalogs.es) as WebTranslationKey[];

describe("catálogos web", () => {
  it("declara la misma clave en español e inglés", () => {
    for (const clave of claves) {
      expect(webCatalogs.en[clave], `falta «${clave}» en inglés`).toBeDefined();
    }
  });

  it("usa los mismos placeholders en español e inglés", () => {
    for (const clave of claves) {
      const es = webCatalogs.es[clave] ?? "";
      const en = webCatalogs.en[clave] ?? "";
      expect(placeholdersDe(en), `placeholders de «${clave}»`).toEqual(placeholdersDe(es));
    }
  });
});
