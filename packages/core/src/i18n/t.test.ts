import { describe, expect, it } from "vitest";
import { en } from "./en.js";
import { es } from "./es.js";
import { t } from "./t.js";

describe("t", () => {
  it("interpola los parametros de la plantilla", () => {
    expect(t("error.configInvalida", { path: "app.yaml" })).toBe(
      "Configuración inválida en app.yaml",
    );
  });

  it("deja el marcador intacto si falta el parametro", () => {
    expect(t("error.configInvalida")).toBe("Configuración inválida en {path}");
  });

  it("usa español como idioma por defecto", () => {
    expect(t("error.generico")).toBe("Se ha producido un error inesperado");
  });

  it("respeta el idioma indicado", () => {
    expect(t("error.generico", undefined, "en")).toBe("An unexpected error occurred");
  });

  it("cae al idioma por defecto si la clave falta en el idioma pedido", () => {
    const original = en["error.generico"];
    Reflect.deleteProperty(en, "error.generico");
    try {
      expect(t("error.generico", undefined, "en")).toBe(es["error.generico"]);
    } finally {
      en["error.generico"] = original;
    }
  });

  it("devuelve la clave si no esta en ningun catalogo", () => {
    const originalEn = en["error.generico"];
    const originalEs = es["error.generico"];
    Reflect.deleteProperty(en, "error.generico");
    Reflect.deleteProperty(es, "error.generico");
    try {
      expect(t("error.generico")).toBe("error.generico");
    } finally {
      en["error.generico"] = originalEn;
      es["error.generico"] = originalEs;
    }
  });
});
