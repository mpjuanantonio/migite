import { describe, expect, it } from "vitest";
import { validateAttributeValue } from "./validate.js";

describe("validateAttributeValue", () => {
  it("accepts a texto value and rejects other shapes", () => {
    expect(validateAttributeValue("texto", "hola")).toEqual([]);
    expect(validateAttributeValue("texto", 42)).toEqual(["expected a string, got 42"]);
    expect(validateAttributeValue("texto", null)).toEqual(["expected a string, got null"]);
  });

  it("accepts finite numbers only", () => {
    expect(validateAttributeValue("numero", 12.5)).toEqual([]);
    expect(validateAttributeValue("numero", Number.NaN)).toEqual([
      "expected a finite number, got NaN",
    ]);
    expect(validateAttributeValue("numero", "12")).toEqual(['expected a finite number, got "12"']);
  });

  it("accepts ISO dates and rejects impossible days", () => {
    expect(validateAttributeValue("fecha", "2026-10-03")).toEqual([]);
    expect(validateAttributeValue("fecha", "2026-02-30")).toEqual([
      'expected an ISO date (YYYY-MM-DD), got "2026-02-30"',
    ]);
    expect(validateAttributeValue("fecha", "03/10/2026")).toEqual([
      'expected an ISO date (YYYY-MM-DD), got "03/10/2026"',
    ]);
    expect(validateAttributeValue("fecha", new Date())).toEqual([
      "expected an ISO date (YYYY-MM-DD), got an object",
    ]);
  });

  it("requires an offset in fecha-hora values", () => {
    expect(validateAttributeValue("fecha-hora", "2026-10-03T10:00:00+02:00")).toEqual([]);
    expect(validateAttributeValue("fecha-hora", "2026-10-03T10:00:00Z")).toEqual([]);
    expect(validateAttributeValue("fecha-hora", "2026-10-03T10:00:00")).toEqual([
      'expected an ISO 8601 datetime with offset, got "2026-10-03T10:00:00"',
    ]);
    expect(validateAttributeValue("fecha-hora", "2026-10-03")).toEqual([
      'expected an ISO 8601 datetime with offset, got "2026-10-03"',
    ]);
    expect(validateAttributeValue("fecha-hora", "2026-13-03T10:00:00+02:00")).toEqual([
      'expected an ISO 8601 datetime with offset, got "2026-13-03T10:00:00+02:00"',
    ]);
  });

  it("accepts only booleans for booleano", () => {
    expect(validateAttributeValue("booleano", true)).toEqual([]);
    expect(validateAttributeValue("booleano", false)).toEqual([]);
    expect(validateAttributeValue("booleano", "true")).toEqual([
      'expected true or false, got "true"',
    ]);
  });

  it("checks seleccion values against the declared options", () => {
    const definition = { opciones: ["pendiente", "hecho"] };

    expect(validateAttributeValue("seleccion", "pendiente", definition)).toEqual([]);
    expect(validateAttributeValue("seleccion", "otro", definition)).toEqual([
      'value "otro" is not one of the declared options',
    ]);
    expect(validateAttributeValue("seleccion", "pendiente")).toEqual([]);
    expect(validateAttributeValue("seleccion", 7, definition)).toEqual([
      "expected a string, got 7",
    ]);
  });

  it("checks every multi-seleccion item against the declared options", () => {
    const definition = { opciones: ["urgente", "casa"] };

    expect(validateAttributeValue("multi-seleccion", ["urgente", "casa"], definition)).toEqual([]);
    expect(validateAttributeValue("multi-seleccion", ["urgente", "trabajo"], definition)).toEqual([
      'value "trabajo" is not one of the declared options',
    ]);
    expect(validateAttributeValue("multi-seleccion", ["urgente", 3], definition)).toEqual([
      "expected a list of strings, got a list",
    ]);
    expect(validateAttributeValue("multi-seleccion", "urgente", definition)).toEqual([
      'expected a list, got "urgente"',
    ]);
  });

  it("accepts http and https urls only", () => {
    expect(validateAttributeValue("url", "https://example.com/a?b=c")).toEqual([]);
    expect(validateAttributeValue("url", "http://example.com")).toEqual([]);
    expect(validateAttributeValue("url", "ftp://example.com")).toEqual([
      'expected an http(s) URL, got "ftp://example.com"',
    ]);
    expect(validateAttributeValue("url", "example.com")).toEqual([
      'expected an http(s) URL, got "example.com"',
    ]);
  });

  it("accepts wikilinks and lists of wikilinks for referencia", () => {
    expect(validateAttributeValue("referencia", "[[Presupuesto 2026]]")).toEqual([]);
    expect(validateAttributeValue("referencia", ["[[A]]", "[[B]]"])).toEqual([]);
    expect(validateAttributeValue("referencia", "Presupuesto 2026")).toEqual([
      'expected a wikilink like "[[Page]]", got "Presupuesto 2026"',
    ]);
    expect(validateAttributeValue("referencia", ["[[A]]", "B"])).toEqual([
      "expected a list of wikilinks, got a list",
    ]);
    expect(validateAttributeValue("referencia", 7)).toEqual([
      "expected a wikilink or a list of wikilinks, got 7",
    ]);
  });

  it("accepts relative paths only for archivo", () => {
    expect(validateAttributeValue("archivo", "adjuntos/plano.png")).toEqual([]);
    expect(validateAttributeValue("archivo", "plano.png")).toEqual([]);
    expect(validateAttributeValue("archivo", "/etc/passwd")).toEqual([
      'expected a relative path, got "/etc/passwd"',
    ]);
    expect(validateAttributeValue("archivo", "../fuera.png")).toEqual([
      'expected a relative path, got "../fuera.png"',
    ]);
    expect(validateAttributeValue("archivo", "C:\\carpeta\\foto.png")).toEqual([
      'expected a relative path, got "C:\\\\carpeta\\\\foto.png"',
    ]);
    expect(validateAttributeValue("archivo", "")).toEqual(['expected a relative path, got ""']);
  });

  it("reports unknown field types", () => {
    expect(validateAttributeValue("desconocido", "valor")).toEqual([
      'unknown field type "desconocido"',
    ]);
  });
});
