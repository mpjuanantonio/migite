import { describe, expect, it } from "vitest";
import { t } from "../i18n/index.js";
import { parseObjectFile, RESERVED_KEYS, writeObjectFile } from "./index.js";
import type { ParsedObjectFile } from "./types.js";

const BODY = `Cuerpo con **formato** y un separador:

---
sigue el cuerpo
`;

const ALL_FIELD_TYPES = `---
# cabecera del fichero
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
tipo: registro
titulo: Factura de luz
creado: 2026-10-02T18:30:00+02:00 # alta
actualizado: 2026-10-03T09:12:00+02:00
enlaces: ["[[Presupuesto 2026]]", "[[Vivienda]]"]

# atributos de los diez tipos de campo
texto: Revisar la lectura del contador
numero: 142.5
fecha: 2026-10-03
fecha-hora: 2026-10-03T10:00:00+02:00
booleano: true
seleccion: pendiente
multi-seleccion: [urgente, casa]
url: https://example.com/factura
referencia: "[[Suministros]]"
archivo: adjuntos/factura-octubre.png
desconocido: "claves libres"
---
${BODY}`;

const expectOk = (text: string): Extract<ParsedObjectFile, { ok: true }> => {
  const parsed = parseObjectFile(text);
  if (!parsed.ok) {
    throw new Error(`expected a parsed file, got: ${parsed.problems.join("; ")}`);
  }
  return parsed;
};

describe("writeObjectFile", () => {
  it("exports the reserved wire keys", () => {
    expect([...RESERVED_KEYS]).toEqual([
      "id",
      "tipo",
      "titulo",
      "creado",
      "actualizado",
      "enlaces",
    ]);
  });

  it("round-trips the ten field types keeping comments, key order and body", () => {
    const parsed = expectOk(ALL_FIELD_TYPES);

    expect(writeObjectFile(parsed.frontmatter, parsed.body, ALL_FIELD_TYPES)).toBe(ALL_FIELD_TYPES);
  });

  it("keeps a file without tipo untouched", () => {
    const text = `---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
titulo: Sin tipo
creado: 2026-10-02T18:30:00+02:00
actualizado: 2026-10-03T09:12:00+02:00
---
cuerpo
`;
    const parsed = expectOk(text);

    expect(parsed.frontmatter.type).toBe("nota");
    expect(writeObjectFile(parsed.frontmatter, parsed.body, text)).toBe(text);
  });

  it("round-trips CRLF files", () => {
    const text =
      "---\r\nid: 01J8XK2P4R5S6T7U8V9W0X1Y2Z\r\ntitulo: Windows\r\ncreado: 2026-10-02T18:30:00+02:00\r\nactualizado: 2026-10-03T09:12:00+02:00\r\nenlaces: []\r\n---\r\ncontenido\r\n";
    const parsed = expectOk(text);

    expect(writeObjectFile(parsed.frontmatter, parsed.body, text)).toBe(text);
  });

  it("keeps comments and body when a single value changes", () => {
    const parsed = expectOk(ALL_FIELD_TYPES);
    const updated = { ...parsed.frontmatter, title: "Factura de luz, ext. 42" };

    const written = writeObjectFile(updated, parsed.body, ALL_FIELD_TYPES);
    const reparsed = expectOk(written);

    expect(written).toContain("# cabecera del fichero");
    expect(written).toContain("# atributos de los diez tipos de campo");
    expect(written).toContain("alta");
    expect(reparsed.frontmatter.title).toBe("Factura de luz, ext. 42");
    expect(reparsed.frontmatter.attributes).toEqual(parsed.frontmatter.attributes);
    expect(reparsed.body).toBe(parsed.body);
    expect(written.endsWith(BODY)).toBe(true);
  });

  it("keeps explicitly empty tipo and enlaces untouched", () => {
    const text = `---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
titulo: Sin enlaces
tipo:
enlaces:
creado: 2026-10-02T18:30:00+02:00
actualizado: 2026-10-03T09:12:00+02:00
---
cuerpo
`;
    const parsed = expectOk(text);

    expect(parsed.frontmatter.type).toBe("nota");
    expect(parsed.frontmatter.links).toEqual([]);
    expect(writeObjectFile(parsed.frontmatter, parsed.body, text)).toBe(text);
  });

  it("round-trips anchors and merge style keys untouched", () => {
    const text = `---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
titulo: Con anclas
creado: 2026-10-02T18:30:00+02:00
actualizado: 2026-10-03T09:12:00+02:00
base: &base
  prioridad: alta
<<: *base
---
cuerpo
`;
    const parsed = expectOk(text);

    expect(parsed.frontmatter.attributes).toEqual({
      base: { prioridad: "alta" },
      "<<": { prioridad: "alta" },
    });
    expect(writeObjectFile(parsed.frontmatter, parsed.body, text)).toBe(text);
  });

  it("updates tipo and enlaces when they change", () => {
    const parsed = expectOk(ALL_FIELD_TYPES);
    const updated = { ...parsed.frontmatter, type: "factura", links: [] };

    const written = writeObjectFile(updated, parsed.body, ALL_FIELD_TYPES);
    const reparsed = expectOk(written);

    expect(written).toContain("tipo: factura");
    expect(written).toContain("enlaces: []");
    expect(reparsed.frontmatter.type).toBe("factura");
    expect(reparsed.frontmatter.links).toEqual([]);
    expect(reparsed.body).toBe(parsed.body);
    expect(written.endsWith(BODY)).toBe(true);
  });

  it("writes a canonical file when there is no base", () => {
    const frontmatter = {
      id: "01J8XK2P4R5S6T7U8V9W0X1Y2Z",
      type: "nota",
      title: "Nota nueva",
      created: "2026-10-02T18:30:00+02:00",
      updated: "2026-10-03T09:12:00+02:00",
      links: ["[[Presupuesto 2026]]"],
      attributes: { hora: "2026-10-03T10:00:00+02:00" },
    };

    const written = writeObjectFile(frontmatter, "Cuerpo\n");
    const parsed = expectOk(written);

    expect(parsed.frontmatter).toEqual(frontmatter);
    expect(parsed.body).toBe("Cuerpo\n");
    expect(written.indexOf("id:")).toBeLessThan(written.indexOf("titulo:"));
    expect(written.indexOf("titulo:")).toBeLessThan(written.indexOf("creado:"));
    expect(written.indexOf("creado:")).toBeLessThan(written.indexOf("actualizado:"));
    expect(written.indexOf("actualizado:")).toBeLessThan(written.indexOf("enlaces:"));
    expect(written.indexOf("enlaces:")).toBeLessThan(written.indexOf("hora:"));
  });

  it("removes deleted attributes and appends new ones", () => {
    const parsed = expectOk(ALL_FIELD_TYPES);
    const attributes = { ...parsed.frontmatter.attributes };
    delete attributes.desconocido;
    attributes.prioridad = "alta";

    const written = writeObjectFile(
      { ...parsed.frontmatter, attributes },
      parsed.body,
      ALL_FIELD_TYPES,
    );
    const reparsed = expectOk(written);

    expect(reparsed.frontmatter.attributes).toEqual({
      texto: "Revisar la lectura del contador",
      numero: 142.5,
      fecha: "2026-10-03",
      "fecha-hora": "2026-10-03T10:00:00+02:00",
      booleano: true,
      seleccion: "pendiente",
      "multi-seleccion": ["urgente", "casa"],
      url: "https://example.com/factura",
      referencia: "[[Suministros]]",
      archivo: "adjuntos/factura-octubre.png",
      prioridad: "alta",
    });
    expect(written).not.toContain("desconocido");
    expect(written).toContain("prioridad: alta");
  });

  it("rejects reserved keys inside attributes", () => {
    const frontmatter = {
      id: "01J8XK2P4R5S6T7U8V9W0X1Y2Z",
      title: "Con atributo reservado",
      created: "2026-10-02T18:30:00+02:00",
      updated: "2026-10-03T09:12:00+02:00",
      links: [],
      attributes: { titulo: "usurpado" },
    };

    expect(() => writeObjectFile(frontmatter, "cuerpo\n")).toThrow(
      t("error.reservedAttributeKey", { key: "titulo" }),
    );
    expect(t("error.reservedAttributeKey", { key: "id" }, "en")).toBe(
      'reserved key "id" cannot be used as an attribute',
    );
  });

  it("keeps the base tipo when the write does not provide one", () => {
    const text = `---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
tipo: registro
titulo: Factura de luz
creado: 2026-10-02T18:30:00+02:00
actualizado: 2026-10-03T09:12:00+02:00
---
cuerpo
`;
    const parsed = expectOk(text);
    const withoutType: typeof parsed.frontmatter = { ...parsed.frontmatter, type: undefined };

    const written = writeObjectFile(withoutType, parsed.body, text);

    expect(written).toBe(text);
    expect(expectOk(written).frontmatter.type).toBe("registro");
  });

  it("applies an explicit tipo change over the base", () => {
    const text = `---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
tipo: registro
titulo: Factura de luz
creado: 2026-10-02T18:30:00+02:00
actualizado: 2026-10-03T09:12:00+02:00
---
cuerpo
`;
    const parsed = expectOk(text);
    const retype: typeof parsed.frontmatter = { ...parsed.frontmatter, type: "gasto" };

    expect(expectOk(writeObjectFile(retype, parsed.body, text)).frontmatter.type).toBe("gasto");
  });

  it("refuses to regenerate a base with broken yaml", () => {
    const frontmatter = {
      id: "01J8XK2P4R5S6T7U8V9W0X1Y2Z",
      title: "Reparado",
      created: "2026-10-02T18:30:00+02:00",
      updated: "2026-10-03T09:12:00+02:00",
      links: [],
      attributes: {},
    };

    expect(() => writeObjectFile(frontmatter, "cuerpo\n", "---\nid: [roto\n---\ncuerpo\n")).toThrow(
      /^frontmatter inválido: invalid YAML syntax/,
    );
    expect(() => writeObjectFile(frontmatter, "cuerpo\n", "---\nid: [roto\n")).toThrow(
      t("error.invalidFrontmatter", {
        problems: 'unterminated frontmatter: missing closing "---" line',
      }),
    );
    expect(() => writeObjectFile(frontmatter, "cuerpo\n", "sin delimitadores\n")).toThrow(
      t("error.invalidFrontmatter", {
        problems: 'missing frontmatter: file must start with "---"',
      }),
    );
  });

  it("writes an empty body without trailing content", () => {
    const frontmatter = {
      id: "01J8XK2P4R5S6T7U8V9W0X1Y2Z",
      title: "Sin cuerpo",
      created: "2026-10-02T18:30:00+02:00",
      updated: "2026-10-03T09:12:00+02:00",
      links: [],
      attributes: {},
    };

    expect(writeObjectFile(frontmatter, "")).toBe(`---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
titulo: Sin cuerpo
creado: 2026-10-02T18:30:00+02:00
actualizado: 2026-10-03T09:12:00+02:00
enlaces: []
---
`);
  });
});
