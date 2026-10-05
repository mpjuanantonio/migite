import { describe, expect, it } from "vitest";
import { en } from "./en.js";
import { es } from "./es.js";
import { t } from "./t.js";

describe("t", () => {
  it("interpolates the template parameters", () => {
    expect(t("error.invalidConfig", { path: "app.yaml" })).toBe(
      "Configuración inválida en app.yaml",
    );
  });

  it("leaves the placeholder intact when the parameter is missing", () => {
    expect(t("error.invalidConfig")).toBe("Configuración inválida en {path}");
  });

  it("uses Spanish as the default locale", () => {
    expect(t("error.genericError")).toBe("Se ha producido un error inesperado");
  });

  it("honors the requested locale", () => {
    expect(t("error.genericError", undefined, "en")).toBe("An unexpected error occurred");
  });

  it("falls back to the default locale when the key is missing in the requested one", () => {
    const original = en["error.genericError"];
    Reflect.deleteProperty(en, "error.genericError");
    try {
      expect(t("error.genericError", undefined, "en")).toBe(es["error.genericError"]);
    } finally {
      en["error.genericError"] = original;
    }
  });

  it("returns the key when it is missing from every catalog", () => {
    const originalEn = en["error.genericError"];
    const originalEs = es["error.genericError"];
    Reflect.deleteProperty(en, "error.genericError");
    Reflect.deleteProperty(es, "error.genericError");
    try {
      expect(t("error.genericError")).toBe("error.genericError");
    } finally {
      en["error.genericError"] = originalEn;
      es["error.genericError"] = originalEs;
    }
  });
});
