import { mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { t } from "../i18n/index.js";
import { MAX_TEXT_FILE_BYTES } from "../limits.js";
import { loadTypeRegistry, type TypeWarning } from "./index.js";

const VALID_LIBRO = `id: libro
nombre: Libro
atributos:
  - id: titulo
    nombre: Titulo
    tipo: texto
    obligatorio: true
`;

const VALID_NOTA = `id: nota
nombre: Nota
atributos: []
`;

const dirs: string[] = [];

const createTypesDir = (files: Readonly<Record<string, string>>): string => {
  const dir = mkdtempSync(join(tmpdir(), "migite-types-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
  }
  return dir;
};

const firstWarning = (warnings: readonly TypeWarning[]): TypeWarning => {
  const warning = warnings[0];
  if (warning === undefined) {
    throw new Error("expected a warning");
  }
  return warning;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("loadTypeRegistry", () => {
  it("registers every yaml file keyed by type id", () => {
    const dir = createTypesDir({ "libro.yaml": VALID_LIBRO, "nota.yml": VALID_NOTA });

    const registry = loadTypeRegistry(dir);

    expect([...registry.types.keys()].sort()).toEqual(["libro", "nota"]);
    expect(registry.types.get("libro")?.attributes).toHaveLength(1);
    expect(registry.types.get("nota")?.system).toBe(true);
    expect(registry.warnings).toEqual([]);
  });

  it("returns an empty registry without warnings when the directory does not exist", () => {
    const registry = loadTypeRegistry(join(tmpdir(), "migite-types-missing"));

    expect(registry.types.size).toBe(0);
    expect(registry.warnings).toEqual([]);
  });

  it("ignores files that are not yaml in silence", () => {
    const dir = createTypesDir({
      "libro.yaml": VALID_LIBRO,
      "leeme.md": "# nada",
      "datos.json": "{}",
      "libro.yaml.bak": "id: copia",
      "sin-extension": "id: oculto",
    });

    const registry = loadTypeRegistry(dir);

    expect([...registry.types.keys()]).toEqual(["libro"]);
    expect(registry.warnings).toEqual([]);
  });

  it("ignores subdirectories in silence", () => {
    const dir = createTypesDir({ "libro.yaml": VALID_LIBRO });
    mkdirSync(join(dir, "anidado.yaml"), { recursive: true });

    const registry = loadTypeRegistry(dir);

    expect([...registry.types.keys()]).toEqual(["libro"]);
    expect(registry.warnings).toEqual([]);
  });

  it("warns and skips a file larger than the read limit before parsing", () => {
    const dir = createTypesDir({ "libro.yaml": VALID_LIBRO });
    truncateSync(join(dir, "libro.yaml"), MAX_TEXT_FILE_BYTES + 1);

    const registry = loadTypeRegistry(dir);

    expect(registry.types.size).toBe(0);
    const warning = firstWarning(registry.warnings);
    expect(warning.path).toBe(join(dir, "libro.yaml"));
    expect(warning.problems.join(" ")).toContain("read limit");
    expect(warning.problems.join(" ")).toContain(String(MAX_TEXT_FILE_BYTES));
  });

  it("warns and skips a file with unreadable YAML", () => {
    const dir = createTypesDir({ "roto.yaml": "atributos: [a, b\n" });

    const registry = loadTypeRegistry(dir);

    expect(registry.types.size).toBe(0);
    const warning = firstWarning(registry.warnings);
    expect(warning.path).toBe(join(dir, "roto.yaml"));
    expect(warning.problems.join(" ")).toContain(t("error.invalidYamlSyntax"));
  });

  it("warns and skips a file with missing fields", () => {
    const dir = createTypesDir({ "incompleto.yaml": "id: incompleto\natributos: []\n" });

    const registry = loadTypeRegistry(dir);

    expect(registry.types.size).toBe(0);
    expect(firstWarning(registry.warnings).problems).toContain('missing required field "nombre"');
  });

  it("registers the type but warns about unknown keys", () => {
    const dir = createTypesDir({
      "libro.yaml": `${VALID_LIBRO}prioridad: alta\n`,
    });

    const registry = loadTypeRegistry(dir);

    expect(registry.types.has("libro")).toBe(true);
    const warning = firstWarning(registry.warnings);
    expect(warning.path).toBe(join(dir, "libro.yaml"));
    expect(warning.problems).toContain('unknown key "prioridad" ignored');
  });

  it("registers the type but warns about every dropped attribute", () => {
    const dir = createTypesDir({
      "libro.yaml": `id: libro
nombre: Libro
atributos:
  - id: hora
    nombre: Hora
    tipo: fecha-hora-2
    obligatorio: true
  - id: titulo
    nombre: Titulo
    tipo: texto
    obligatorio: true
`,
    });

    const registry = loadTypeRegistry(dir);

    expect(registry.types.get("libro")?.attributes.map((attribute) => attribute.id)).toEqual([
      "titulo",
    ]);
    expect(registry.warnings).toHaveLength(1);
    const warning = firstWarning(registry.warnings);
    expect(warning.problems).toHaveLength(1);
    expect(warning.problems[0]?.startsWith('attribute "hora":')).toBe(true);
  });

  it("keeps the first of duplicated attribute ids and warns", () => {
    const dir = createTypesDir({
      "libro.yaml": `id: libro
nombre: Libro
atributos:
  - id: titulo
    nombre: Primero
    tipo: texto
    obligatorio: true
  - id: titulo
    nombre: Segundo
    tipo: texto
    obligatorio: true
`,
    });

    const registry = loadTypeRegistry(dir);

    expect(registry.types.get("libro")?.attributes[0]?.name).toBe("Primero");
    expect(firstWarning(registry.warnings).problems).toContain(
      'duplicate attribute id "titulo", first definition kept',
    );
  });

  it("keeps the first of duplicated type ids across files and warns", () => {
    const dir = createTypesDir({
      "a.yaml": "id: libro\nnombre: Primero\natributos: []\n",
      "b.yaml": "id: libro\nnombre: Segundo\natributos: []\n",
    });

    const registry = loadTypeRegistry(dir);

    expect(registry.types.get("libro")?.name).toBe("Primero");
    const warning = firstWarning(registry.warnings);
    expect(warning.path).toBe(join(dir, "b.yaml"));
    expect(warning.problems.join(" ")).toContain('duplicate type id "libro"');
  });

  it("exposes every warning as a path with a list of problems", () => {
    const dir = createTypesDir({
      "a-roto.yaml": "atributos: [a, b\n",
      "b-incompleto.yaml": "id: b\natributos: []\n",
      "c-extra.yaml": "id: c\nnombre: C\natributos: []\nextra: 1\n",
      "d-atributo.yaml": `id: d
nombre: D
atributos:
  - id: hora
    nombre: Hora
    tipo: desconocido
    obligatorio: true
`,
    });

    const registry = loadTypeRegistry(dir);

    expect(registry.warnings).toHaveLength(4);
    for (const warning of registry.warnings) {
      expect(Object.keys(warning).sort()).toEqual(["path", "problems"]);
      expect(warning.path.startsWith(dir)).toBe(true);
      expect(warning.problems.length).toBeGreaterThan(0);
      for (const problem of warning.problems) {
        expect(typeof problem).toBe("string");
        expect(problem.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("renders the warnings with the i18n keys", () => {
    const dir = createTypesDir({ "libro.yaml": `${VALID_LIBRO}prioridad: alta\n` });

    const warning = firstWarning(loadTypeRegistry(dir).warnings);
    const message = t("warning.invalidTypeFile", {
      path: warning.path,
      problems: warning.problems.join("; "),
    });

    expect(message).toContain(warning.path);
    expect(message).toContain('unknown key "prioridad" ignored');

    const attributeMessage = t("warning.invalidTypeAttribute", {
      path: warning.path,
      id: "hora",
    });

    expect(attributeMessage).toContain(warning.path);
    expect(attributeMessage).toContain("hora");
  });
});
