import { describe, expect, it } from "vitest";
import { catalogs } from "./catalogs.js";
import { checkCatalogs } from "./check.js";
import { locales } from "./locales.js";

describe("checkCatalogs", () => {
  it("no reporta problemas con los catalogos del proyecto", () => {
    expect(
      checkCatalogs(catalogs),
      "Claves sin traducir o huerfanas: anade la traduccion en todos los idiomas",
    ).toEqual([]);
  });

  it("reporta claves presentes en un idioma y ausentes en el otro", () => {
    expect(checkCatalogs({ es: { "a.b": "AB" }, en: {} })).toEqual([
      'clave "a.b" presente en [es] pero ausente en [en]',
    ]);
  });

  it("reporta claves huerfanas sin equivalente en el otro idioma", () => {
    expect(checkCatalogs({ es: {}, en: { "a.b": "AB" } })).toEqual([
      'clave "a.b" presente en [en] pero ausente en [es]',
    ]);
  });

  it("cubre todos los idiomas soportados con su catalogo", () => {
    expect([...locales].sort()).toEqual(Object.keys(catalogs).sort());
  });
});
