import type { AttributePayload } from "@migite/contracts";
import { describe, expect, it } from "vitest";
import {
  aTexto,
  aTextoCrudo,
  aWire,
  construirAtributos,
  filtrarVacios,
  iguales,
  parsearCrudo,
} from "./atributos";

const definicion = (overrides: Partial<AttributePayload> = {}): AttributePayload => ({
  id: "campo",
  nombre: "Campo",
  tipo: "texto",
  obligatorio: false,
  ...overrides,
});

describe("aTexto", () => {
  it("devuelve cadena vacía para valores ausentes", () => {
    expect(aTexto("texto", undefined)).toBe("");
    expect(aTexto("texto", null)).toBe("");
  });

  it("convierte fecha-hora ISO a formato de input local", () => {
    const texto = aTexto("fecha-hora", "2026-10-05T12:30:00.000Z");
    expect(texto).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("desenvuelve wikilinks al mostrar listas de referencias", () => {
    expect(aTexto("referencia", ["[[Alfa]]", "[[Beta]]"])).toBe("Alfa, Beta");
    expect(aTexto("referencia", "[[Alfa]]")).toBe("[[Alfa]]");
  });

  it("serializa objetos y listas sin tipo declarado", () => {
    expect(aTexto(undefined, { a: 1 })).toBe('{"a":1}');
    expect(aTexto("multi-seleccion", ["uno", "dos"])).toBe("uno, dos");
    expect(aTexto("numero", 12)).toBe("12");
  });
});

describe("aTextoCrudo", () => {
  it("muestra las cadenas tal cual y el resto como JSON", () => {
    expect(aTextoCrudo("hola")).toBe("hola");
    expect(aTextoCrudo(1200)).toBe("1200");
    expect(aTextoCrudo(true)).toBe("true");
    expect(aTextoCrudo(["a", "b"])).toBe('["a","b"]');
    expect(aTextoCrudo(null)).toBe("");
  });
});

describe("aWire", () => {
  it("convierte texto de cada tipo de campo", () => {
    expect(aWire("texto", "hola")).toBe("hola");
    expect(aWire("numero", "12.5")).toBe(12.5);
    expect(aWire("numero", "")).toBeNull();
    expect(aWire("booleano", true)).toBe(true);
    expect(aWire("seleccion", "hecha")).toBe("hecha");
    expect(aWire("seleccion", "")).toBeNull();
    expect(aWire("fecha", "2026-10-10")).toBe("2026-10-10");
    expect(aWire("fecha", "")).toBeNull();
    expect(aWire("multi-seleccion", ["a", "b"])).toEqual(["a", "b"]);
    expect(aWire("multi-seleccion", "a, b")).toEqual(["a", "b"]);
    expect(aWire("url", "https://ejemplo.dev")).toBe("https://ejemplo.dev");
    expect(aWire("archivo", "docs/a.pdf")).toBe("docs/a.pdf");
    expect(aWire("archivo", "")).toBeNull();
  });

  it("envuelve referencias en wikilinks y conserva las que ya lo son", () => {
    expect(aWire("referencia", "Alfa")).toBe("[[Alfa]]");
    expect(aWire("referencia", "[[Alfa]]")).toBe("[[Alfa]]");
    expect(aWire("referencia", "Alfa, Beta")).toEqual(["[[Alfa]]", "[[Beta]]"]);
    expect(aWire("referencia", "")).toBeNull();
  });

  it("convierte una fecha-hora local a ISO con zona", () => {
    const iso = aWire("fecha-hora", "2026-10-05T14:30");
    expect(typeof iso).toBe("string");
    expect(Number.isNaN(Date.parse(String(iso)))).toBe(false);
  });

  it("mantiene el texto inválido para que la API lo rechace", () => {
    expect(aWire("numero", "abc")).toBe("abc");
  });
});

describe("parsearCrudo", () => {
  it("interpreta JSON y conserva el texto si no lo es", () => {
    expect(parsearCrudo("1500")).toBe(1500);
    expect(parsearCrudo("true")).toBe(true);
    expect(parsearCrudo('["a","b"]')).toEqual(["a", "b"]);
    expect(parsearCrudo("[[Alfa]]")).toBe("[[Alfa]]");
    expect(parsearCrudo("")).toBe("");
  });
});

describe("filtrarVacios e iguales", () => {
  it("elimina claves con null o undefined", () => {
    expect(filtrarVacios({ a: 1, b: null, c: undefined, d: "" })).toEqual({ a: 1, d: "" });
  });

  it("compara en profundidad", () => {
    expect(iguales({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(iguales({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(iguales([1, 2], [2, 1])).toBe(false);
    expect(iguales(null, undefined)).toBe(false);
    expect(iguales("a", "a")).toBe(true);
  });
});

describe("construirAtributos", () => {
  const definiciones = new Map<string, AttributePayload>([
    [
      "estado",
      definicion({ id: "estado", tipo: "seleccion", obligatorio: true, opciones: ["pendiente"] }),
    ],
    ["vencimiento", definicion({ id: "vencimiento", tipo: "fecha", obligatorio: false })],
    ["urgente", definicion({ id: "urgente", tipo: "booleano", obligatorio: false })],
  ]);

  it("fusiona los cambios con los valores actuales", () => {
    const resultado = construirAtributos(
      { id: "01", atributos: { estado: "pendiente", vencimiento: "2026-10-01" } },
      { objetoId: "01", valores: { vencimiento: "2026-10-10", urgente: true }, eliminados: [] },
      definiciones,
    );
    expect(resultado).toEqual({
      estado: "pendiente",
      vencimiento: "2026-10-10",
      urgente: true,
    });
  });

  it("envía null al eliminar y respeta los obligatorios", () => {
    const resultado = construirAtributos(
      { id: "01", atributos: { estado: "pendiente", vencimiento: "2026-10-01", libre: 7 } },
      { objetoId: "01", valores: {}, eliminados: ["vencimiento", "libre", "estado"] },
      definiciones,
    );
    expect(resultado).toEqual({ estado: "pendiente", vencimiento: null, libre: null });
  });

  it("parsea el valor de un atributo libre nuevo", () => {
    const resultado = construirAtributos(
      { id: "01", atributos: {} },
      { objetoId: "01", valores: { presupuesto: "1200" }, eliminados: [] },
      definiciones,
    );
    expect(resultado).toEqual({ presupuesto: 1200 });
  });

  it("ignora un borrador de otro objeto", () => {
    const resultado = construirAtributos(
      { id: "01", atributos: { estado: "pendiente" } },
      { objetoId: "otro", valores: { estado: "hecha" }, eliminados: [] },
      definiciones,
    );
    expect(resultado).toEqual({ estado: "pendiente" });
  });
});
