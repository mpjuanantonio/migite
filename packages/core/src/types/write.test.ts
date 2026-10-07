import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AttributeDefinition,
  type CreateTypeInput,
  createTypeFile,
  deleteTypeFile,
  loadTypeRegistry,
  TypeOperationError,
  updateTypeFile,
} from "./index.js";

const fsGate = vi.hoisted(() => ({ failRename: false }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    renameSync: (from: string, to: string) => {
      if (fsGate.failRename) {
        throw new Error("injected rename failure");
      }
      return actual.renameSync(from, to);
    },
  };
});

const TITULO: AttributeDefinition = { id: "titulo", name: "Titulo", type: "text", required: true };

const GENERO: AttributeDefinition = {
  id: "genero",
  name: "Genero",
  type: "select",
  role: "status",
  required: false,
  options: ["novela", "ensayo"],
};

const LIBRO: CreateTypeInput = {
  id: "libro",
  name: "Libro",
  description: "Lectura pendiente",
  attributes: [TITULO, GENERO],
};

const roots: string[] = [];

const createTiposDir = (): string => {
  const root = mkdtempSync(join(tmpdir(), "migite-types-write-"));
  roots.push(root);
  return join(root, "tipos");
};

const captureError = (action: () => unknown): TypeOperationError => {
  try {
    action();
  } catch (error) {
    if (error instanceof TypeOperationError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a TypeOperationError");
};

afterEach(() => {
  fsGate.failRename = false;
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("createTypeFile", () => {
  it("writes a new type in the documented format and returns the normalized definition", () => {
    const tiposDir = createTiposDir();

    const definition = createTypeFile(tiposDir, LIBRO);

    expect(definition).toEqual({ ...LIBRO, system: false });
    expect(readFileSync(join(tiposDir, "libro.yaml"), "utf8")).toBe(`id: libro
nombre: Libro
descripcion: Lectura pendiente
atributos:
  - id: titulo
    nombre: Titulo
    tipo: texto
    obligatorio: true
    opciones: []
    referencia_a: []
  - id: genero
    nombre: Genero
    tipo: seleccion
    rol: estado
    obligatorio: false
    opciones: [novela, ensayo]
    referencia_a: []
`);
    const registry = loadTypeRegistry(tiposDir);
    expect(registry.warnings).toEqual([]);
    expect(registry.types.get("libro")).toEqual(definition);
  });

  it("creates the tipos directory when it does not exist", () => {
    const root = mkdtempSync(join(tmpdir(), "migite-types-write-"));
    roots.push(root);
    const tiposDir = join(root, "vault", "tipos");

    createTypeFile(tiposDir, LIBRO);

    expect(existsSync(join(tiposDir, "libro.yaml"))).toBe(true);
  });

  it("rejects reserved ids with error.typeNotEditable", () => {
    const tiposDir = createTiposDir();

    const error = captureError(() => createTypeFile(tiposDir, { ...LIBRO, id: "nota" }));

    expect(error.key).toBe("error.typeNotEditable");
    expect(error.params).toEqual({ id: "nota" });
    expect(error.message).toBe("el tipo «nota» es nativo y no se puede editar");
    expect(existsSync(tiposDir)).toBe(false);
  });

  it("refuses to overwrite an existing file with error.typeAlreadyExists", () => {
    const tiposDir = createTiposDir();
    createTypeFile(tiposDir, LIBRO);
    const before = readFileSync(join(tiposDir, "libro.yaml"), "utf8");

    const error = captureError(() => createTypeFile(tiposDir, { ...LIBRO, name: "Otro" }));

    expect(error.key).toBe("error.typeAlreadyExists");
    expect(error.params).toEqual({ id: "libro" });
    expect(readFileSync(join(tiposDir, "libro.yaml"), "utf8")).toBe(before);
  });

  it("rejects an invalid id before touching the filesystem", () => {
    const tiposDir = createTiposDir();

    const error = captureError(() => createTypeFile(tiposDir, { ...LIBRO, id: "tipo malo" }));

    expect(error.key).toBe("error.validationError");
    expect(error.problems.join(" ")).toContain("id");
    expect(existsSync(tiposDir)).toBe(false);
  });

  it("rejects duplicated attribute ids", () => {
    const tiposDir = createTiposDir();

    const error = captureError(() =>
      createTypeFile(tiposDir, { ...LIBRO, attributes: [TITULO, { ...TITULO, name: "Otro" }] }),
    );

    expect(error.key).toBe("error.validationError");
    expect(error.problems.join(" ")).toContain("duplicate");
  });
});

describe("updateTypeFile", () => {
  it("adds attributes to an existing type", () => {
    const tiposDir = createTiposDir();
    createTypeFile(tiposDir, LIBRO);

    const updated = updateTypeFile(tiposDir, "libro", {
      attributes: [
        ...LIBRO.attributes,
        { id: "editorial", name: "Editorial", type: "text", required: false },
      ],
    });

    expect(updated.attributes.map((attribute) => attribute.id)).toEqual([
      "titulo",
      "genero",
      "editorial",
    ]);
    expect(loadTypeRegistry(tiposDir).types.get("libro")).toEqual(updated);
  });

  it("renames the type, its attributes and changes the description", () => {
    const tiposDir = createTiposDir();
    createTypeFile(tiposDir, LIBRO);

    const updated = updateTypeFile(tiposDir, "libro", {
      name: "Libro de lectura",
      description: "Nueva descripcion",
      attributes: [{ ...TITULO, name: "Obra" }],
    });

    expect(updated.name).toBe("Libro de lectura");
    expect(updated.description).toBe("Nueva descripcion");
    expect(updated.attributes).toEqual([{ ...TITULO, name: "Obra" }]);
  });

  it("removes an attribute without touching the data already stored in objects", () => {
    const root = mkdtempSync(join(tmpdir(), "migite-types-write-"));
    roots.push(root);
    const tiposDir = join(root, "tipos");
    createTypeFile(tiposDir, LIBRO);
    const objectPath = join(root, "lectura.md");
    const objectText = `---
id: 01JTESTULID
titulo: Mi libro
tipo: libro
genero: novela
---

Cuerpo que menciona genero: novela.
`;
    writeFileSync(objectPath, objectText, "utf8");

    const updated = updateTypeFile(tiposDir, "libro", { attributes: [TITULO] });

    expect(updated.attributes.map((attribute) => attribute.id)).toEqual(["titulo"]);
    expect(readFileSync(objectPath, "utf8")).toBe(objectText);
  });

  it("rejects changing the type of an existing attribute and leaves the file intact", () => {
    const tiposDir = createTiposDir();
    createTypeFile(tiposDir, LIBRO);
    const path = join(tiposDir, "libro.yaml");
    const before = readFileSync(path, "utf8");

    const error = captureError(() =>
      updateTypeFile(tiposDir, "libro", { attributes: [{ ...TITULO, type: "number" }] }),
    );

    expect(error.key).toBe("error.attributeTypeImmutable");
    expect(error.params).toEqual({ id: "titulo" });
    expect(error.message).toBe("no se puede cambiar el tipo del atributo «titulo»");
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("rejects reserved ids with error.typeNotEditable", () => {
    const tiposDir = createTiposDir();

    const error = captureError(() => updateTypeFile(tiposDir, "nota", { name: "Otra" }));

    expect(error.key).toBe("error.typeNotEditable");
    expect(error.params).toEqual({ id: "nota" });
  });

  it("reports a missing type with error.notFound", () => {
    const tiposDir = createTiposDir();

    const error = captureError(() => updateTypeFile(tiposDir, "fantasma", { name: "Fantasma" }));

    expect(error.key).toBe("error.notFound");
    expect(error.params).toEqual({ id: "fantasma" });
  });

  it("does not derive paths from unsafe ids", () => {
    const root = mkdtempSync(join(tmpdir(), "migite-types-write-"));
    roots.push(root);
    const tiposDir = join(root, "tipos");
    createTypeFile(tiposDir, LIBRO);

    const error = captureError(() => updateTypeFile(tiposDir, "../fuera", { name: "Fuera" }));

    expect(error.key).toBe("error.notFound");
    expect(existsSync(join(root, "fuera.yaml"))).toBe(false);
  });

  it("refuses to rewrite a type file that is not valid", () => {
    const tiposDir = createTiposDir();
    mkdirSync(tiposDir, { recursive: true });
    const path = join(tiposDir, "roto.yaml");
    const broken = "id: roto\nnombre: Roto\natributos: [\n";
    writeFileSync(path, broken, "utf8");

    const error = captureError(() => updateTypeFile(tiposDir, "roto", { name: "Otro" }));

    expect(error.key).toBe("error.validationError");
    expect(error.problems.length).toBeGreaterThan(0);
    expect(readFileSync(path, "utf8")).toBe(broken);
  });

  it("refuses a file whose content id does not match its file name", () => {
    const tiposDir = createTiposDir();
    mkdirSync(tiposDir, { recursive: true });
    const path = join(tiposDir, "libro.yaml");
    const mismatched = "id: otro\nnombre: Otro\natributos: []\n";
    writeFileSync(path, mismatched, "utf8");

    const error = captureError(() => updateTypeFile(tiposDir, "libro", { name: "Otro" }));

    expect(error.key).toBe("error.validationError");
    expect(readFileSync(path, "utf8")).toBe(mismatched);
  });

  it("keeps the previous YAML when the atomic write fails", () => {
    const tiposDir = createTiposDir();
    createTypeFile(tiposDir, LIBRO);
    const path = join(tiposDir, "libro.yaml");
    const before = readFileSync(path, "utf8");
    fsGate.failRename = true;

    expect(() => updateTypeFile(tiposDir, "libro", { name: "Cambiado" })).toThrow(
      "injected rename failure",
    );

    expect(readFileSync(path, "utf8")).toBe(before);
    expect(readdirSync(tiposDir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});

describe("deleteTypeFile", () => {
  it("deletes the YAML file of a custom type", () => {
    const tiposDir = createTiposDir();
    createTypeFile(tiposDir, LIBRO);

    deleteTypeFile(tiposDir, "libro");

    expect(existsSync(join(tiposDir, "libro.yaml"))).toBe(false);
    expect(loadTypeRegistry(tiposDir).types.size).toBe(0);
  });

  it("rejects reserved ids with error.typeNotEditable", () => {
    const tiposDir = createTiposDir();

    const error = captureError(() => deleteTypeFile(tiposDir, "tarea"));

    expect(error.key).toBe("error.typeNotEditable");
    expect(error.params).toEqual({ id: "tarea" });
  });

  it("reports a missing type with error.notFound", () => {
    const tiposDir = createTiposDir();

    const error = captureError(() => deleteTypeFile(tiposDir, "fantasma"));

    expect(error.key).toBe("error.notFound");
    expect(error.params).toEqual({ id: "fantasma" });
  });
});
