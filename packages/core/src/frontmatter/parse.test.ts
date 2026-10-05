import { describe, expect, it } from "vitest";
import { t } from "../i18n/index.js";
import { parseObjectFile } from "./parse.js";
import type { ParsedObjectFile } from "./types.js";

const EXAMPLE = `---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
tipo: recordatorio
titulo: Llamar al banco
creado: 2026-10-02T18:30:00+02:00
actualizado: 2026-10-03T09:12:00+02:00
enlaces: ["[[Presupuesto 2026]]"]
hora: 2026-10-03T10:00:00+02:00
---
Preguntar por el préstamo. Relacionado con [[Presupuesto 2026]].
`;

const expectOk = (text: string): Extract<ParsedObjectFile, { ok: true }> => {
  const parsed = parseObjectFile(text);
  if (!parsed.ok) {
    throw new Error(`expected a parsed file, got: ${parsed.problems.join("; ")}`);
  }
  return parsed;
};

const expectFailure = (text: string): Extract<ParsedObjectFile, { ok: false }> => {
  const parsed = parseObjectFile(text);
  if (parsed.ok) {
    throw new Error("expected a failing parse");
  }
  return parsed;
};

describe("parseObjectFile", () => {
  it("parses the documented object file", () => {
    const parsed = expectOk(EXAMPLE);

    expect(parsed.frontmatter).toEqual({
      id: "01J8XK2P4R5S6T7U8V9W0X1Y2Z",
      type: "recordatorio",
      title: "Llamar al banco",
      created: "2026-10-02T18:30:00+02:00",
      updated: "2026-10-03T09:12:00+02:00",
      links: ["[[Presupuesto 2026]]"],
      attributes: { hora: "2026-10-03T10:00:00+02:00" },
    });
    expect(parsed.body).toBe("Preguntar por el préstamo. Relacionado con [[Presupuesto 2026]].\n");
  });

  it("defaults tipo to nota when the key is absent", () => {
    const parsed = expectOk(`---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
titulo: Nota sin tipo
creado: 2026-10-02T18:30:00+02:00
actualizado: 2026-10-03T09:12:00+02:00
---
cuerpo
`);

    expect(parsed.frontmatter.type).toBe("nota");
    expect(parsed.frontmatter.links).toEqual([]);
  });

  it("keeps unknown keys as raw attribute values", () => {
    const parsed = expectOk(`---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
titulo: Atributos
creado: 2026-10-02T18:30:00+02:00
actualizado: 2026-10-03T09:12:00+02:00
enlaces:
numero: 142.5
booleano: true
multi: [uno, dos]
anidado:
  clave: valor
texto: "  con espacios  "
---
cuerpo
`);

    expect(parsed.frontmatter.attributes).toEqual({
      numero: 142.5,
      booleano: true,
      multi: ["uno", "dos"],
      anidado: { clave: "valor" },
      texto: "  con espacios  ",
    });
    expect(Object.hasOwn(parsed.frontmatter.attributes, "enlaces")).toBe(false);
  });

  it("does not normalize values that mismatch their field type", () => {
    const parsed = expectOk(`---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
titulo: Sin validar
creado: 2026-10-02T18:30:00+02:00
actualizado: 2026-10-03T09:12:00+02:00
hora: ayer
conteo: "42"
enlace: no-es-wikilink
---
cuerpo
`);

    expect(parsed.frontmatter.attributes).toEqual({
      hora: "ayer",
      conteo: "42",
      enlace: "no-es-wikilink",
    });
  });

  it("preserves the body byte for byte", () => {
    const text = `---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
titulo: Con separador
creado: 2026-10-02T18:30:00+02:00
actualizado: 2026-10-03T09:12:00+02:00
---
# Título

---

| columna | valor |
| ------- | ----- |
`;
    const parsed = expectOk(text);

    expect(parsed.body).toBe(`# Título

---

| columna | valor |
| ------- | ----- |
`);
  });

  it("parses files with CRLF line endings", () => {
    const parsed = expectOk(
      "---\r\nid: 01J8XK2P4R5S6T7U8V9W0X1Y2Z\r\ntitulo: Windows\r\ncreado: 2026-10-02T18:30:00+02:00\r\nactualizado: 2026-10-03T09:12:00+02:00\r\n---\r\ncontenido\r\n",
    );

    expect(parsed.frontmatter.title).toBe("Windows");
    expect(parsed.body).toBe("contenido\r\n");
  });

  it("reports a missing frontmatter keeping the whole file as raw", () => {
    const failure = expectFailure("solo cuerpo\n");

    expect(failure.problems).toEqual(['missing frontmatter: file must start with "---"']);
    expect(failure.raw).toEqual({ yamlText: "", body: "solo cuerpo\n" });
  });

  it("reports an unterminated frontmatter keeping the whole file as raw", () => {
    const failure = expectFailure("---\nid: 01J8XK2P4R5S6T7U8V9W0X1Y2Z\n");

    expect(failure.problems).toEqual(['unterminated frontmatter: missing closing "---" line']);
    expect(failure.raw).toEqual({ yamlText: "", body: "---\nid: 01J8XK2P4R5S6T7U8V9W0X1Y2Z\n" });
  });

  it("reports broken yaml keeping the raw sections", () => {
    const failure = expectFailure("---\nid: [uno\ntitulo: Roto\n---\ncuerpo\n");

    expect(failure.ok).toBe(false);
    expect(failure.problems[0]).toMatch(/^invalid YAML syntax \(/);
    expect(failure.raw).toEqual({ yamlText: "id: [uno\ntitulo: Roto\n", body: "cuerpo\n" });
  });

  it("reports missing reserved keys", () => {
    const failure = expectFailure("---\nid: 01J8XK2P4R5S6T7U8V9W0X1Y2Z\n---\ncuerpo\n");

    expect(failure.problems).toEqual([
      'missing required key "titulo"',
      'missing required key "creado"',
      'missing required key "actualizado"',
    ]);
    expect(failure.raw.yamlText).toBe("id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z\n");
  });

  it("reports reserved keys with an unexpected shape", () => {
    const failure = expectFailure(`---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
titulo: 42
creado: 2026-10-02T18:30:00+02:00
actualizado: 2026-10-03T09:12:00+02:00
enlaces: "[[Presupuesto 2026]]"
---
cuerpo
`);

    expect(failure.problems).toEqual([
      'key "titulo" must be a string',
      'key "enlaces" must be a list of strings',
    ]);
  });

  it("reports a frontmatter that is not a mapping", () => {
    const failure = expectFailure("---\n- uno\n- dos\n---\ncuerpo\n");

    expect(failure.problems).toEqual(["frontmatter must be a YAML mapping"]);
    expect(failure.raw).toEqual({ yamlText: "- uno\n- dos\n", body: "cuerpo\n" });
  });

  it("reports keys that are not plain strings", () => {
    const numeric = expectFailure(`---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
titulo: Numerico
creado: 2026-10-02T18:30:00+02:00
actualizado: 2026-10-03T09:12:00+02:00
2026: valor
---
cuerpo
`);

    expect(numeric.problems).toEqual(['frontmatter key "2026" must be a string']);

    const complex = expectFailure(`---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
titulo: Complejo
creado: 2026-10-02T18:30:00+02:00
actualizado: 2026-10-03T09:12:00+02:00
? [uno, dos]
: valor
---
cuerpo
`);

    expect(complex.problems).toEqual(["frontmatter key must be a string"]);
  });

  it("exposes the problems through the invalid frontmatter translation", () => {
    const failure = expectFailure("solo cuerpo\n");

    expect(t("error.invalidFrontmatter", { problems: failure.problems.join("; ") })).toBe(
      'frontmatter inválido: missing frontmatter: file must start with "---"',
    );
    expect(t("error.invalidFrontmatter", { problems: "x" }, "en")).toBe("invalid frontmatter: x");
  });
});
