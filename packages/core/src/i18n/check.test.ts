import { describe, expect, it } from "vitest";
import { catalogs } from "./catalogs.js";
import { checkCatalogs } from "./check.js";
import { locales } from "./locales.js";

describe("checkCatalogs", () => {
  it("reports no problems for the project catalogs", () => {
    expect(
      checkCatalogs(catalogs),
      "Untranslated or orphan keys: add the translation in every locale",
    ).toEqual([]);
  });

  it("reports keys present in one locale and missing in the other", () => {
    expect(checkCatalogs({ es: { "a.b": "AB" }, en: {} })).toEqual([
      'clave "a.b" presente en [es] pero ausente en [en]',
    ]);
  });

  it("reports orphan keys with no counterpart in the other locale", () => {
    expect(checkCatalogs({ es: {}, en: { "a.b": "AB" } })).toEqual([
      'clave "a.b" presente en [en] pero ausente en [es]',
    ]);
  });

  it("covers every supported locale with its catalog", () => {
    expect([...locales].sort()).toEqual(Object.keys(catalogs).sort());
  });
});
