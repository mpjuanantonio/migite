import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ObjectFrontmatter, parseObjectFile } from "../frontmatter/index.js";
import { t } from "../i18n/index.js";
import { NATIVE_TYPE_IDS } from "../native-types/index.js";
import { loadTypeRegistry } from "../types/index.js";
import { isUlid } from "../ulid.js";
import {
  bootstrapVault,
  createObjectRepository,
  ObjectOperationError,
  type ObjectRecord,
  type ObjectRepository,
  RESERVED_ROOT_DIRS,
  type ReadObjectResult,
  type UpdateObjectChanges,
} from "./index.js";
import { MAX_OBJECT_BYTES, scanVaultFiles } from "./vault.js";

const fsGates = vi.hoisted(() => {
  const injectedError = (code: string, action: string): NodeJS.ErrnoException => {
    const error = new Error(`${code}: injected failure, ${action}`) as NodeJS.ErrnoException;
    error.code = code;
    return error;
  };
  return {
    unlinkError: undefined as string | undefined,
    linkError: undefined as string | undefined,
    fsyncError: undefined as string | undefined,
    readGate: undefined as { suffix: string; onRead: number; text: string } | undefined,
    reads: new Map<string, number>(),
    injectedError,
  };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    unlinkSync: (path: Parameters<typeof actual.unlinkSync>[0]) => {
      if (fsGates.unlinkError === undefined) {
        return actual.unlinkSync(path);
      }
      throw fsGates.injectedError(fsGates.unlinkError, `unlink "${String(path)}"`);
    },
    linkSync: (
      existingPath: Parameters<typeof actual.linkSync>[0],
      newPath: Parameters<typeof actual.linkSync>[1],
    ) => {
      if (fsGates.linkError === undefined) {
        return actual.linkSync(existingPath, newPath);
      }
      throw fsGates.injectedError(fsGates.linkError, `link "${String(newPath)}"`);
    },
    fsyncSync: (fd: number) => {
      if (fsGates.fsyncError === undefined) {
        return actual.fsyncSync(fd);
      }
      throw fsGates.injectedError(fsGates.fsyncError, "fsync");
    },
    readFileSync: (
      path: Parameters<typeof actual.readFileSync>[0],
      options?: Parameters<typeof actual.readFileSync>[1],
    ) => {
      const key = String(path);
      const count = (fsGates.reads.get(key) ?? 0) + 1;
      fsGates.reads.set(key, count);
      const gate = fsGates.readGate;
      if (gate !== undefined && key.endsWith(gate.suffix) && count === gate.onRead) {
        fsGates.readGate = undefined;
        return gate.text;
      }
      return actual.readFileSync(path, options);
    },
  };
});

vi.mock("../types/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../types/index.js")>();
  return { ...actual, loadTypeRegistry: vi.fn(actual.loadTypeRegistry) };
});

vi.mock("./vault.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vault.js")>();
  return { ...actual, scanVaultFiles: vi.fn(actual.scanVaultFiles) };
});

const roots: string[] = [];

const setupVault = (timeZone = "Europe/Madrid"): { vaultDir: string; repo: ObjectRepository } => {
  const vaultDir = mkdtempSync(join(tmpdir(), "migite-objects-"));
  roots.push(vaultDir);
  bootstrapVault(vaultDir);
  return { vaultDir, repo: createObjectRepository({ vaultDir, timeZone }) };
};

const captureError = (action: () => unknown): ObjectOperationError => {
  try {
    action();
  } catch (error) {
    if (error instanceof ObjectOperationError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected an ObjectOperationError");
};

const readOk = (result: ReadObjectResult): ObjectRecord => {
  if (!result.ok) {
    throw new Error(`expected a readable object, got: ${result.problems.join("; ")}`);
  }
  return result.object;
};

const objectText = (title: string, body = "cuerpo\n"): string => `---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
titulo: ${title}
creado: 2026-10-05T14:00:00.000+02:00
actualizado: 2026-10-05T14:00:00.000+02:00
---
${body}`;

const parseVaultFile = (
  vaultDir: string,
  path: string,
): { frontmatter: ObjectFrontmatter; body: string } => {
  const parsed = parseObjectFile(readFileSync(join(vaultDir, path), "utf8"));
  if (!parsed.ok) {
    throw new Error(`expected a parsed file at ${path}, got: ${parsed.problems.join("; ")}`);
  }
  return { frontmatter: parsed.frontmatter, body: parsed.body };
};

afterEach(() => {
  vi.useRealTimers();
  fsGates.unlinkError = undefined;
  fsGates.linkError = undefined;
  fsGates.fsyncError = undefined;
  fsGates.readGate = undefined;
  fsGates.reads.clear();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("createObject", () => {
  it("creates a note without type and writes a parseable file", () => {
    const { vaultDir, repo } = setupVault();

    const record = repo.createObject({
      title: "Llamar al banco",
      body: "Preguntar por el préstamo.\n",
    });

    expect(record.type).toBe("nota");
    expect(record.path).toBe("llamar-al-banco.md");
    expect(record.folder).toBe("");
    expect(record.fileName).toBe("llamar-al-banco.md");
    expect(isUlid(record.id)).toBe(true);
    expect(record.created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    expect(existsSync(join(vaultDir, "llamar-al-banco.md"))).toBe(true);
    expect(parseVaultFile(vaultDir, record.path)).toEqual({
      frontmatter: {
        id: record.id,
        type: "nota",
        title: "Llamar al banco",
        created: record.created,
        updated: record.updated,
        links: [],
        attributes: {},
      },
      body: "Preguntar por el préstamo.\n",
    });
  });

  it("rejects a task whose required estado attribute is missing", () => {
    const { vaultDir, repo } = setupVault();

    const error = captureError(() => repo.createObject({ title: "Comprar pan", type: "tarea" }));

    expect(error.key).toBe("error.missingRequiredAttribute");
    expect(error.missing).toEqual(["estado"]);
    expect(error.problems).toContain('missing required attribute "estado"');
    expect(error.message).toBe(t("error.missingRequiredAttribute", { id: "estado" }));
    expect(existsSync(join(vaultDir, "comprar-pan.md"))).toBe(false);
  });

  it("rejects option values outside the declared options", () => {
    const { vaultDir, repo } = setupVault();

    const error = captureError(() =>
      repo.createObject({
        title: "Tarea rara",
        type: "tarea",
        attributes: { estado: "hechisima" },
      }),
    );

    expect(error.key).toBe("error.invalidObjectWrite");
    expect(error.problems.join(" ")).toContain('attribute "estado"');
    expect(error.problems.join(" ")).toContain(
      'value "hechisima" is not one of the declared options',
    );
    expect(existsSync(join(vaultDir, "tarea-rara.md"))).toBe(false);
  });

  it("accepts free attributes that are not declared in the type", () => {
    const { vaultDir, repo } = setupVault();

    const record = repo.createObject({
      title: "Comprar regalo",
      type: "tarea",
      attributes: {
        estado: "pendiente",
        prioridad: "alta",
        etiquetas: ["casa", "cumple"],
      },
    });

    expect(record.attributes).toEqual({
      estado: "pendiente",
      prioridad: "alta",
      etiquetas: ["casa", "cumple"],
    });
    expect(parseVaultFile(vaultDir, record.path).frontmatter.attributes).toEqual({
      estado: "pendiente",
      prioridad: "alta",
      etiquetas: ["casa", "cumple"],
    });
  });

  it("suffixes the slug with a short ulid when the file name collides", () => {
    const { repo } = setupVault();

    const first = repo.createObject({ title: "Llamar al banco" });
    const second = repo.createObject({ title: "Llamar al banco" });

    expect(first.path).toBe("llamar-al-banco.md");
    expect(second.path).toBe(`llamar-al-banco-${second.id.slice(0, 4).toLowerCase()}.md`);
    expect(second.path).toMatch(/^llamar-al-banco-[0-9a-z]{4}\.md$/);
  });

  it("falls back to a random stem when the title has no slug", () => {
    const { repo } = setupVault();

    const record = repo.createObject({ title: "???" });

    expect(record.path).toMatch(/^objeto-[0-9a-z]{4}\.md$/);
    const empty = captureError(() => repo.createObject({ title: "   " }));
    expect(empty.key).toBe("error.invalidObjectWrite");
    expect(empty.problems.join(" ")).toContain("title must not be empty");
  });

  it("retries the next candidate when the name is taken between selection and write", () => {
    const { vaultDir, repo } = setupVault();
    symlinkSync(join(vaultDir, "no-existe.md"), join(vaultDir, "carrera.md"));

    const record = repo.createObject({ title: "Carrera" });

    expect(record.path).toBe(`carrera-${record.id.slice(0, 4).toLowerCase()}.md`);
    expect(record.fileName).toMatch(/^carrera-[0-9a-z]{4}\.md$/);
    expect(parseVaultFile(vaultDir, record.path).frontmatter.id).toBe(record.id);
    expect(lstatSync(join(vaultDir, "carrera.md")).isSymbolicLink()).toBe(true);
  });

  it("generates timestamps with the offset of the repository time zone", () => {
    const { repo: madrid } = setupVault("Europe/Madrid");
    const { repo: utc } = setupVault("UTC");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T12:00:00.000Z"));

    const inMadrid = madrid.createObject({ title: "En Madrid" });
    const inUtc = utc.createObject({ title: "En UTC" });

    vi.useRealTimers();
    expect(inMadrid.created).toBe("2026-10-05T14:00:00.000+02:00");
    expect(inUtc.created).toBe("2026-10-05T12:00:00.000+00:00");
  });

  it("rejects an unknown time zone", () => {
    expect(() =>
      createObjectRepository({
        vaultDir: join(tmpdir(), "migite-objects-zone"),
        timeZone: "Not/AZone",
      }),
    ).toThrow(t("error.invalidTimeZone"));
  });

  it("rejects a type without a definition in the vault", () => {
    const { repo } = setupVault();

    const error = captureError(() => repo.createObject({ title: "X", type: "fantasma" }));

    expect(error.key).toBe("error.invalidObjectWrite");
    expect(error.problems.join(" ")).toContain('unknown type "fantasma"');
  });

  it("rejects folders under a reserved root name and parent traversal", () => {
    const { repo } = setupVault();

    const reserved = captureError(() => repo.createObject({ title: "X", folder: "tipos" }));
    const traversal = captureError(() => repo.createObject({ title: "X", folder: "../fuera" }));

    expect(reserved.key).toBe("error.invalidObjectWrite");
    expect(reserved.problems.join(" ")).toContain('folder "tipos" is reserved at the vault root');
    expect(traversal.problems.join(" ")).toContain('folder "../fuera" must not contain ".."');
  });

  it("rejects reserved frontmatter keys used as attributes", () => {
    const { repo } = setupVault();

    const error = captureError(() =>
      repo.createObject({ title: "X", attributes: { titulo: "usurpado" } }),
    );

    expect(error.key).toBe("error.invalidObjectWrite");
    expect(error.problems.join(" ")).toContain(
      'reserved key "titulo" cannot be used as an attribute',
    );
  });

  it("rejects free attribute values that would not survive a round trip", () => {
    const { repo } = setupVault();

    const error = captureError(() =>
      repo.createObject({ title: "X", attributes: { cuando: new Date("2026-10-05T00:00:00Z") } }),
    );

    expect(error.key).toBe("error.invalidObjectWrite");
    expect(error.problems.join(" ")).toContain('attribute "cuando"');
    expect(error.problems.join(" ")).toContain("JSON-compatible");
  });
});

describe("readObject", () => {
  it("resolves by id, relative path, path without extension and title", () => {
    const { vaultDir, repo } = setupVault();
    const note = repo.createObject({ title: "Llamar al banco", body: "cuerpo\n" });

    expect(readOk(repo.readObject(note.id)).path).toBe("llamar-al-banco.md");
    expect(readOk(repo.readObject("llamar-al-banco.md")).id).toBe(note.id);
    expect(readOk(repo.readObject("llamar-al-banco")).id).toBe(note.id);
    expect(readOk(repo.readObject("Llamar al banco")).id).toBe(note.id);
    expect(readOk(repo.readObject(note.path)).body).toBe("cuerpo\n");
    expect(readOk(repo.readObject(join(vaultDir, "llamar-al-banco.md"))).id).toBe(note.id);
  });

  it("throws objectNotFound for an unknown reference", () => {
    const { repo } = setupVault();

    const error = captureError(() => repo.readObject("no-existe"));

    expect(error.key).toBe("error.objectNotFound");
    expect(error.message).toBe(t("error.objectNotFound", { id: "no-existe" }));
  });

  it("throws ambiguousTitle when a title matches several objects", () => {
    const { vaultDir, repo } = setupVault();
    const first = repo.createObject({ title: "Duplicada", body: "primera\n" });
    const second = repo.createObject({
      title: "Duplicada",
      folder: "archivadas",
      body: "segunda\n",
    });

    expect(second.path).toBe("archivadas/duplicada.md");

    const readError = captureError(() => repo.readObject("Duplicada"));

    expect(readError.key).toBe("error.ambiguousTitle");
    expect(readError.message).toBe(t("error.ambiguousTitle", { title: "Duplicada" }));
    expect(captureError(() => repo.updateObject("Duplicada", { body: "nueva\n" })).key).toBe(
      "error.ambiguousTitle",
    );
    expect(captureError(() => repo.deleteObject("Duplicada")).key).toBe("error.ambiguousTitle");
    expect(parseVaultFile(vaultDir, first.path).body).toBe("primera\n");
    expect(parseVaultFile(vaultDir, second.path).body).toBe("segunda\n");

    expect(repo.findObjectByTitle("Duplicada")?.path).toBe(first.path);
    expect(readOk(repo.readObject(first.id)).path).toBe(first.path);
    expect(readOk(repo.readObject("archivadas/duplicada.md")).id).toBe(second.id);
  });

  it("keeps an unreadable file raw, lists it as degraded and out of updates", () => {
    const { vaultDir, repo } = setupVault();
    const broken = "---\nid: [roto\ntitulo: Rota\nprioridad: alta\n---\ncuerpo\n";
    writeFileSync(join(vaultDir, "roto.md"), broken, "utf8");

    const result = repo.readObject("roto.md");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.path).toBe("roto.md");
      expect(result.raw.body).toBe("cuerpo\n");
      expect(result.raw.yamlText).toBe("id: [roto\ntitulo: Rota\nprioridad: alta\n");
      expect(result.problems.length).toBeGreaterThan(0);
      expect(result.degraded.title).toBe("Rota");
      expect(result.degraded.body).toBe("cuerpo\n");
      expect(result.degraded.attributes).toEqual({ prioridad: "alta" });
    }
    const summary = repo.listObjects().find((item) => item.path === "roto.md");

    expect(summary).toMatchObject({
      id: "",
      type: "",
      title: "Rota",
      path: "roto.md",
      folder: "",
      updated: "",
    });
    expect(summary?.degraded).toHaveLength(1);
    expect(summary?.degraded[0]?.kind).toBe("unreadableFrontmatter");

    const error = captureError(() => repo.updateObject("roto.md", { body: "nuevo" }));

    expect(error.key).toBe("error.invalidObjectWrite");
    expect(readFileSync(join(vaultDir, "roto.md"), "utf8")).toBe(broken);
  });

  it("falls back to the file name and an empty attribute map when no YAML is readable", () => {
    const { vaultDir, repo } = setupVault();
    writeFileSync(join(vaultDir, "leeme.md"), "sin frontmatter\n", "utf8");

    const result = repo.readObject("leeme.md");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.degraded).toEqual({
        title: "leeme",
        body: "sin frontmatter\n",
        attributes: {},
      });
    }
  });

  it("reads a value that fails validation without destroying it", () => {
    const { vaultDir, repo } = setupVault();
    const raw = `---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
tipo: tarea
titulo: Crudo
creado: 2026-10-05T14:00:00.000+02:00
actualizado: 2026-10-05T14:00:00.000+02:00
estado: no-declarado
---
cuerpo
`;
    writeFileSync(join(vaultDir, "crudo.md"), raw, "utf8");

    const record = readOk(repo.readObject("crudo.md"));

    expect(record.attributes.estado).toBe("no-declarado");
    expect(record.degraded).toEqual([
      {
        kind: "invalidAttribute",
        key: "estado",
        problems: ['value "no-declarado" is not one of the declared options'],
      },
    ]);
    const error = captureError(() => repo.updateObject(record.id, { body: "nuevo" }));
    expect(error.key).toBe("error.invalidObjectWrite");
    expect(readFileSync(join(vaultDir, "crudo.md"), "utf8")).toBe(raw);
  });
});

describe("degraded mode", () => {
  it("marks a healthy object with no degradation reasons", () => {
    const { repo } = setupVault();
    const note = repo.createObject({ title: "Sana", body: "cuerpo\n" });

    expect(note.degraded).toEqual([]);
    expect(readOk(repo.readObject(note.id)).degraded).toEqual([]);
    const summary = repo.listObjects().find((item) => item.path === note.path);
    expect(summary?.degraded).toEqual([]);
  });

  it("flags a type with no definition as unknownType and keeps the attributes raw", () => {
    const { vaultDir, repo } = setupVault();
    writeFileSync(
      join(vaultDir, "sin-tipo.md"),
      `---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
tipo: fantasma
titulo: Sin tipo
creado: 2026-10-05T14:00:00.000+02:00
actualizado: 2026-10-05T14:00:00.000+02:00
prioridad: alta
---
cuerpo
`,
      "utf8",
    );

    const record = readOk(repo.readObject("sin-tipo.md"));

    expect(record.degraded).toEqual([{ kind: "unknownType", type: "fantasma" }]);
    expect(record.attributes).toEqual({ prioridad: "alta" });
    const summary = repo.listObjects().find((item) => item.path === "sin-tipo.md");
    expect(summary?.degraded).toEqual([{ kind: "unknownType", type: "fantasma" }]);
  });

  it("flags a type file that exists but cannot be used as brokenType", () => {
    const { vaultDir, repo } = setupVault();
    writeFileSync(join(vaultDir, "tipos", "roto.yaml"), "id: roto\nnombre: Roto\n", "utf8");
    writeFileSync(
      join(vaultDir, "rota.md"),
      `---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
tipo: roto
titulo: Rota
creado: 2026-10-05T14:00:00.000+02:00
actualizado: 2026-10-05T14:00:00.000+02:00
---
cuerpo
`,
      "utf8",
    );

    const [reason] = readOk(repo.readObject("rota.md")).degraded;

    expect(reason?.kind).toBe("brokenType");
    if (reason?.kind === "brokenType") {
      expect(reason.type).toBe("roto");
      expect(reason.problems.join(" ")).toContain('missing required field "atributos"');
    }
  });

  it("does not flag free attributes or null values for declared attributes", () => {
    const { vaultDir, repo } = setupVault();
    writeFileSync(
      join(vaultDir, "libre.md"),
      `---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
tipo: tarea
titulo: Libre
creado: 2026-10-05T14:00:00.000+02:00
actualizado: 2026-10-05T14:00:00.000+02:00
estado: null
prioridad: alta
---
cuerpo
`,
      "utf8",
    );

    const record = readOk(repo.readObject("libre.md"));

    expect(record.degraded).toEqual([]);
    expect(record.attributes).toEqual({ estado: null, prioridad: "alta" });
  });
});

describe("updateObject", () => {
  it("refreshes actualizado with the time zone offset and rewrites the body", () => {
    const { vaultDir, repo } = setupVault("Europe/Madrid");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T12:00:00.000Z"));

    const created = repo.createObject({ title: "Nota con hora", body: "uno\n" });
    vi.setSystemTime(new Date("2026-10-05T12:00:05.250Z"));
    const updated = repo.updateObject(created.id, { body: "dos\n" });

    vi.useRealTimers();
    expect(created.created).toBe("2026-10-05T14:00:00.000+02:00");
    expect(created.updated).toBe(created.created);
    expect(updated.created).toBe("2026-10-05T14:00:00.000+02:00");
    expect(updated.updated).toBe("2026-10-05T14:00:05.250+02:00");
    expect(updated.body).toBe("dos\n");
    const file = parseVaultFile(vaultDir, updated.path);
    expect(file.frontmatter.created).toBe("2026-10-05T14:00:00.000+02:00");
    expect(file.frontmatter.updated).toBe("2026-10-05T14:00:05.250+02:00");
    expect(file.body).toBe("dos\n");
  });

  it("merges attribute changes without dropping the others", () => {
    const { vaultDir, repo } = setupVault();
    const task = repo.createObject({
      title: "Comprar pan",
      type: "tarea",
      attributes: { estado: "pendiente", prioridad: "alta" },
    });

    const updated = repo.updateObject(task.id, { attributes: { estado: "en curso" } });

    expect(updated.attributes).toEqual({ estado: "en curso", prioridad: "alta" });
    const file = parseVaultFile(vaultDir, task.path);
    expect(file.frontmatter.attributes).toEqual({ estado: "en curso", prioridad: "alta" });
    expect(file.frontmatter.created).toBe(task.created);
  });

  it("removes an attribute when the change sets it to undefined", () => {
    const { vaultDir, repo } = setupVault();
    const task = repo.createObject({
      title: "Comprar pan",
      type: "tarea",
      attributes: { estado: "pendiente", prioridad: "alta" },
    });

    const updated = repo.updateObject(task.id, { attributes: { prioridad: undefined } });

    expect(updated.attributes).toEqual({ estado: "pendiente" });
    expect(parseVaultFile(vaultDir, task.path).frontmatter.attributes).toEqual({
      estado: "pendiente",
    });
  });

  it("rejects a title change and points at the rename operation", () => {
    const { vaultDir, repo } = setupVault();
    const note = repo.createObject({ title: "Llamar al banco" });

    const error = captureError(() => repo.updateObject(note.id, { title: "Llamar a César" }));

    expect(error.key).toBe("error.titleChangeRequiresRename");
    expect(error.message).toBe(t("error.titleChangeRequiresRename"));
    expect(parseVaultFile(vaultDir, note.path).frontmatter.title).toBe("Llamar al banco");
    expect(existsSync(join(vaultDir, "llamar-a-cesar.md"))).toBe(false);
    expect(repo.updateObject(note.id, { title: "Llamar al banco" }).title).toBe("Llamar al banco");
  });

  it("rejects a type change because tipo is immutable", () => {
    const { repo } = setupVault();
    const note = repo.createObject({ title: "Solo notas" });
    const changes: Record<string, unknown> = { type: "tarea" };

    const error = captureError(() => repo.updateObject(note.id, changes as UpdateObjectChanges));

    expect(error.key).toBe("error.invalidObjectWrite");
    expect(error.problems.join(" ")).toContain('"tipo" field is immutable');
  });

  it("validates the merged result so option values cannot become invalid", () => {
    const { repo } = setupVault();
    const task = repo.createObject({
      title: "Comprar pan",
      type: "tarea",
      attributes: { estado: "pendiente" },
    });

    const error = captureError(() =>
      repo.updateObject(task.id, { attributes: { estado: "no-existe" } }),
    );

    expect(error.key).toBe("error.invalidObjectWrite");
    expect(error.problems.join(" ")).toContain(
      'value "no-existe" is not one of the declared options',
    );
  });

  it("updates a degraded object without a usable schema so it can be repaired", () => {
    const { vaultDir, repo } = setupVault();
    writeFileSync(
      join(vaultDir, "reparable.md"),
      `---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
tipo: fantasma
titulo: Reparable
creado: 2026-10-05T14:00:00.000+02:00
actualizado: 2026-10-05T14:00:00.000+02:00
prioridad: alta
---
cuerpo viejo
`,
      "utf8",
    );

    const updated = repo.updateObject("reparable.md", {
      body: "cuerpo nuevo\n",
      links: ["[[Otra nota]]"],
      attributes: { estado: "lo-que-sea" },
    });

    expect(updated.body).toBe("cuerpo nuevo\n");
    expect(updated.links).toEqual(["[[Otra nota]]"]);
    expect(updated.attributes).toEqual({ prioridad: "alta", estado: "lo-que-sea" });
    expect(updated.degraded).toEqual([{ kind: "unknownType", type: "fantasma" }]);
    const file = parseVaultFile(vaultDir, updated.path);

    expect(file.frontmatter.type).toBe("fantasma");
    expect(file.frontmatter.links).toEqual(["[[Otra nota]]"]);
    expect(file.frontmatter.attributes).toEqual({ prioridad: "alta", estado: "lo-que-sea" });
    expect(file.body).toBe("cuerpo nuevo\n");
    expect(file.frontmatter.updated).not.toBe(file.frontmatter.created);
  });

  it("updates an object whose type file is broken", () => {
    const { vaultDir, repo } = setupVault();
    writeFileSync(join(vaultDir, "tipos", "roto.yaml"), "id: roto\nnombre: Roto\n", "utf8");
    writeFileSync(
      join(vaultDir, "rota.md"),
      `---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
tipo: roto
titulo: Rota
creado: 2026-10-05T14:00:00.000+02:00
actualizado: 2026-10-05T14:00:00.000+02:00
---
cuerpo viejo
`,
      "utf8",
    );

    const updated = repo.updateObject("rota.md", {
      body: "cuerpo nuevo\n",
      attributes: { libre: true },
    });

    expect(updated.body).toBe("cuerpo nuevo\n");
    expect(updated.attributes).toEqual({ libre: true });
    expect(updated.degraded.map((reason) => reason.kind)).toEqual(["brokenType"]);
    expect(parseVaultFile(vaultDir, updated.path).body).toBe("cuerpo nuevo\n");
  });

  it("still rejects unsafe values and reserved keys in degraded mode", () => {
    const { vaultDir, repo } = setupVault();
    writeFileSync(
      join(vaultDir, "reparable.md"),
      `---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
tipo: fantasma
titulo: Reparable
creado: 2026-10-05T14:00:00.000+02:00
actualizado: 2026-10-05T14:00:00.000+02:00
---
cuerpo
`,
      "utf8",
    );

    const unsafe = captureError(() =>
      repo.updateObject("reparable.md", {
        attributes: { cuando: new Date("2026-10-05T00:00:00Z") },
      }),
    );
    const reserved = captureError(() =>
      repo.updateObject("reparable.md", { attributes: { titulo: "usurpado" } }),
    );

    expect(unsafe.key).toBe("error.invalidObjectWrite");
    expect(unsafe.problems.join(" ")).toContain('attribute "cuando"');
    expect(reserved.key).toBe("error.invalidObjectWrite");
    expect(reserved.problems.join(" ")).toContain('reserved key "titulo"');
  });
});

describe("deleteObject", () => {
  it("deletes only that file and leaves related objects untouched", () => {
    const { vaultDir, repo } = setupVault();
    const first = repo.createObject({
      title: "Primera nota",
      body: "ver [[Segunda nota]]\n",
      links: ["[[Segunda nota]]"],
    });
    const second = repo.createObject({ title: "Segunda nota", body: "dos\n" });
    const secondText = readFileSync(join(vaultDir, second.path), "utf8");

    repo.deleteObject(first.id);

    expect(existsSync(join(vaultDir, first.path))).toBe(false);
    expect(readFileSync(join(vaultDir, second.path), "utf8")).toBe(secondText);
    expect(repo.listObjects().map((summary) => summary.path)).toEqual([second.path]);
    expect(() => repo.readObject(first.id)).toThrow(ObjectOperationError);
  });

  it("throws objectNotFound when the object does not exist", () => {
    const { repo } = setupVault();

    const error = captureError(() => repo.deleteObject("no-existe"));

    expect(error.key).toBe("error.objectNotFound");
  });

  it("wraps a filesystem failure of unlink in objectDeleteFailed", () => {
    const { vaultDir, repo } = setupVault();
    const note = repo.createObject({ title: "Bloqueada", body: "cuerpo\n" });
    const text = readFileSync(join(vaultDir, note.path), "utf8");
    fsGates.unlinkError = "EBUSY";

    const error = captureError(() => repo.deleteObject(note.id));

    expect(error.key).toBe("error.objectDeleteFailed");
    expect(error.message).toContain("EBUSY");
    expect(error.message).toContain(note.id);
    expect(t("error.objectDeleteFailed", { id: "x", detail: "EBUSY" }, "en")).toBe(
      "could not delete object x: EBUSY",
    );
    expect(error.problems.join(" ")).toContain("EBUSY");
    expect(readFileSync(join(vaultDir, note.path), "utf8")).toBe(text);

    fsGates.unlinkError = undefined;
    repo.deleteObject(note.id);
    expect(existsSync(join(vaultDir, note.path))).toBe(false);
  });
});

describe("vault containment", () => {
  const setupSymlinks = (): {
    vaultDir: string;
    repo: ObjectRepository;
    outsideDir: string;
    outsideFile: string;
  } => {
    const { vaultDir, repo } = setupVault();
    const outsideDir = mkdtempSync(join(tmpdir(), "migite-outside-"));
    roots.push(outsideDir);
    const outsideFile = join(outsideDir, "secreto.md");
    writeFileSync(outsideFile, objectText("Secreto", "fuera del vault\n"), "utf8");
    symlinkSync(outsideDir, join(vaultDir, "enlace"));
    symlinkSync(outsideFile, join(vaultDir, "enlazado.md"));
    return { vaultDir, repo, outsideDir, outsideFile };
  };

  it("refuses to read through a symlinked directory or file", () => {
    const { repo } = setupSymlinks();

    expect(captureError(() => repo.readObject("enlace/secreto.md")).key).toBe(
      "error.objectNotFound",
    );
    expect(captureError(() => repo.readObject("enlace/secreto")).key).toBe("error.objectNotFound");
    expect(captureError(() => repo.readObject("enlazado.md")).key).toBe("error.objectNotFound");
    expect(captureError(() => repo.readObject("enlazado")).key).toBe("error.objectNotFound");
  });

  it("refuses to update, delete or rename through a symlinked file", () => {
    const { repo, outsideFile } = setupSymlinks();
    const outsideText = readFileSync(outsideFile, "utf8");

    expect(captureError(() => repo.updateObject("enlazado.md", { body: "tocado\n" })).key).toBe(
      "error.objectNotFound",
    );
    expect(captureError(() => repo.deleteObject("enlazado.md")).key).toBe("error.objectNotFound");
    expect(captureError(() => repo.renameObject("enlazado.md", "Otro")).key).toBe(
      "error.objectNotFound",
    );
    expect(readFileSync(outsideFile, "utf8")).toBe(outsideText);
  });

  it("refuses to create or move into a symlinked directory", () => {
    const { vaultDir, repo, outsideDir } = setupSymlinks();
    const note = repo.createObject({ title: "Mover" });

    const created = captureError(() => repo.createObject({ title: "Intruso", folder: "enlace" }));
    const moved = captureError(() => repo.moveObject(note.id, "enlace"));

    expect(created.key).toBe("error.invalidObjectWrite");
    expect(created.problems.join(" ")).toContain("not a regular directory inside the vault");
    expect(moved.key).toBe("error.invalidObjectWrite");
    expect(moved.problems.join(" ")).toContain("not a regular directory inside the vault");
    expect(existsSync(join(outsideDir, "intruso.md"))).toBe(false);
    expect(existsSync(join(outsideDir, "mover.md"))).toBe(false);
    expect(existsSync(join(vaultDir, "mover.md"))).toBe(true);
  });

  it("keeps symlinked entries out of the vault listing", () => {
    const { repo } = setupSymlinks();

    expect(repo.listObjects()).toEqual([]);
  });
});

describe("atomic writes", () => {
  it("keeps the previous content when an update cannot finish the write", () => {
    const { vaultDir, repo } = setupVault();
    const note = repo.createObject({ title: "Atomica", body: "original\n" });
    const before = readFileSync(join(vaultDir, note.path), "utf8");
    fsGates.fsyncError = "EIO";

    expect(() => repo.updateObject(note.id, { body: "nuevo\n" })).toThrow(/EIO/);

    fsGates.fsyncError = undefined;
    expect(readFileSync(join(vaultDir, note.path), "utf8")).toBe(before);
    expect(readdirSync(vaultDir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("does not leave a partial file when a create cannot finish the write", () => {
    const { vaultDir, repo } = setupVault();
    fsGates.fsyncError = "EIO";

    expect(() => repo.createObject({ title: "Parcial" })).toThrow(/EIO/);

    fsGates.fsyncError = undefined;
    expect(existsSync(join(vaultDir, "parcial.md"))).toBe(false);
    expect(readdirSync(vaultDir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("rejects an update when the file changed on disk after it was read", () => {
    const { vaultDir, repo } = setupVault();
    const note = repo.createObject({ title: "Concurrente", body: "original\n" });
    const before = readFileSync(join(vaultDir, note.path), "utf8");
    fsGates.reads.clear();
    fsGates.readGate = {
      suffix: note.path,
      onRead: 3,
      text: before.replace("original", "editado fuera"),
    };

    const error = captureError(() => repo.updateObject(note.id, { body: "nuevo\n" }));

    expect(error.key).toBe("error.invalidObjectWrite");
    expect(error.problems.join(" ")).toContain("changed on disk since it was read");
    expect(readFileSync(join(vaultDir, note.path), "utf8")).toBe(before);
  });
});

describe("read size limit", () => {
  it("refuses to read an object larger than the limit", () => {
    const { vaultDir, repo } = setupVault();
    writeFileSync(join(vaultDir, "grande.md"), Buffer.alloc(MAX_OBJECT_BYTES + 1, 0x61));

    const result = repo.readObject("grande.md");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.join(" ")).toContain("read limit");
      expect(result.degraded.title).toBe("grande");
    }
    const summary = repo.listObjects().find((item) => item.path === "grande.md");
    expect(summary?.degraded[0]?.kind).toBe("unreadableFrontmatter");
  });
});

describe("listObjects", () => {
  it("scans every folder except the reserved root names and non markdown files", () => {
    const { vaultDir, repo } = setupVault();
    repo.createObject({ title: "En la raíz" });
    repo.createObject({ title: "Informe anual", folder: "proyectos/2026" });
    repo.createObject({ title: "Apunte de tipos", folder: "proyectos/tipos" });
    for (const reserved of RESERVED_ROOT_DIRS) {
      mkdirSync(join(vaultDir, reserved), { recursive: true });
      writeFileSync(
        join(vaultDir, reserved, "objeto.md"),
        `---
id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z
titulo: ${reserved}
creado: 2026-10-05T14:00:00.000+02:00
actualizado: 2026-10-05T14:00:00.000+02:00
---
reservado
`,
        "utf8",
      );
    }
    writeFileSync(join(vaultDir, "sueltos.txt"), "no markdown", "utf8");
    writeFileSync(join(vaultDir, "leeme.md"), "sin frontmatter\n", "utf8");

    const list = repo.listObjects();

    expect(list.map((summary) => summary.path).sort()).toEqual([
      "en-la-raiz.md",
      "leeme.md",
      "proyectos/2026/informe-anual.md",
      "proyectos/tipos/apunte-de-tipos.md",
    ]);
    const broken = list.find((summary) => summary.path === "leeme.md");

    expect(broken).toMatchObject({ id: "", type: "", title: "leeme", updated: "" });
    expect(broken?.degraded).toEqual([
      {
        kind: "unreadableFrontmatter",
        problems: ['missing frontmatter: file must start with "---"'],
      },
    ]);
    const informe = list.find((summary) => summary.title === "Informe anual");
    if (informe === undefined) {
      throw new Error("expected the informe summary");
    }
    expect(informe).toMatchObject({
      folder: "proyectos/2026",
      path: "proyectos/2026/informe-anual.md",
      type: "nota",
    });
    expect(informe.updated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    expect(isUlid(informe.id)).toBe(true);
    const first = list[0];
    expect(Object.keys(first ?? {}).sort()).toEqual([
      "degraded",
      "folder",
      "id",
      "path",
      "title",
      "type",
      "updated",
    ]);
  });

  it("round-trips every written value without loss", () => {
    const { vaultDir, repo } = setupVault();
    const created = repo.createObject({
      title: "Factura de luz",
      type: "tarea",
      body: "Revisar el contador.\n",
      links: ["[[Presupuesto 2026]]"],
      attributes: {
        estado: "pendiente",
        vencimiento: "2026-10-10",
        prioridad: "alta",
        etiquetas: ["casa", "urgente"],
        notas: "texto libre",
      },
    });
    const expected = {
      id: created.id,
      type: "tarea",
      title: "Factura de luz",
      created: created.created,
      updated: created.updated,
      links: ["[[Presupuesto 2026]]"],
      attributes: {
        estado: "pendiente",
        vencimiento: "2026-10-10",
        prioridad: "alta",
        etiquetas: ["casa", "urgente"],
        notas: "texto libre",
      },
    };

    expect(parseVaultFile(vaultDir, created.path)).toEqual({
      frontmatter: expected,
      body: "Revisar el contador.\n",
    });

    const updated = repo.updateObject(created.id, { body: "Contador revisado.\n" });
    const file = parseVaultFile(vaultDir, created.path);

    expect(file.frontmatter).toEqual({ ...expected, updated: updated.updated });
    expect(file.frontmatter.attributes).toEqual(expected.attributes);
    expect(file.body).toBe("Contador revisado.\n");
  });
});

describe("object index", () => {
  it("scans the vault once and only re-scans after a write or a delete", () => {
    const { repo } = setupVault();
    vi.mocked(scanVaultFiles).mockClear();

    const note = repo.createObject({ title: "Indexada", body: "cuerpo\n" });
    expect(vi.mocked(scanVaultFiles).mock.calls).toHaveLength(0);

    expect(readOk(repo.readObject(note.id)).body).toBe("cuerpo\n");
    expect(readOk(repo.readObject("Indexada")).id).toBe(note.id);
    expect(readOk(repo.readObject(note.path)).id).toBe(note.id);
    expect(repo.findObjectByTitle("Indexada")?.path).toBe(note.path);
    expect(vi.mocked(scanVaultFiles).mock.calls).toHaveLength(1);

    repo.updateObject(note.id, { body: "actualizado\n" });
    expect(readOk(repo.readObject(note.id)).body).toBe("actualizado\n");
    expect(vi.mocked(scanVaultFiles).mock.calls).toHaveLength(2);

    repo.deleteObject(note.id);
    expect(captureError(() => repo.readObject(note.id)).key).toBe("error.objectNotFound");
    expect(vi.mocked(scanVaultFiles).mock.calls).toHaveLength(3);
  });

  it("does not re-scan the vault on a clean miss", () => {
    const { repo } = setupVault();
    const note = repo.createObject({ title: "Indexada", body: "cuerpo\n" });
    expect(readOk(repo.readObject(note.id)).id).toBe(note.id);
    vi.mocked(scanVaultFiles).mockClear();

    expect(captureError(() => repo.readObject("no-existe")).key).toBe("error.objectNotFound");

    expect(vi.mocked(scanVaultFiles).mock.calls).toHaveLength(0);
    expect(readOk(repo.readObject("Indexada")).id).toBe(note.id);
    expect(vi.mocked(scanVaultFiles).mock.calls).toHaveLength(0);
  });

  it("picks up an external file once an internal write invalidates the index", () => {
    const { vaultDir, repo } = setupVault();
    const first = repo.createObject({ title: "Primera" });
    expect(readOk(repo.readObject(first.id)).id).toBe(first.id);
    writeFileSync(
      join(vaultDir, "externa.md"),
      `---
id: 01J8XK2P4R5S6T7U8V9W0X1Y3Z
titulo: Externa
creado: 2026-10-05T14:00:00.000+02:00
actualizado: 2026-10-05T14:00:00.000+02:00
---
escrita fuera del repositorio
`,
      "utf8",
    );

    expect(captureError(() => repo.readObject("Externa")).key).toBe("error.objectNotFound");

    repo.createObject({ title: "Otra" });

    expect(readOk(repo.readObject("Externa")).body).toBe("escrita fuera del repositorio\n");
    expect(repo.findObjectByTitle("Externa")?.path).toBe("externa.md");
  });
});

describe("type registry access", () => {
  it("seeds the native types and exposes the registry with warnings", () => {
    const vaultDir = mkdtempSync(join(tmpdir(), "migite-objects-"));
    roots.push(vaultDir);

    const bootstrap = bootstrapVault(vaultDir);
    const again = bootstrapVault(vaultDir);
    const repo = createObjectRepository({ vaultDir, timeZone: "Europe/Madrid" });

    expect(bootstrap.seed.created).toEqual([...NATIVE_TYPE_IDS]);
    expect(again.seed).toEqual({ created: [], skipped: [...NATIVE_TYPE_IDS] });
    expect(bootstrap.types.map((type) => type.id)).toEqual([...NATIVE_TYPE_IDS].sort());
    expect(bootstrap.warnings).toEqual([]);
    expect(repo.listTypes().map((type) => type.id)).toEqual([...NATIVE_TYPE_IDS].sort());
    expect(repo.listTypeWarnings()).toEqual([]);
    expect(
      repo.getType("tarea")?.attributes.find((attribute) => attribute.id === "estado")?.required,
    ).toBe(true);
    expect(repo.getType("inexistente")).toBeUndefined();
  });

  it("loads the type registry once per instance and re-checks it explicitly", () => {
    const { vaultDir, repo } = setupVault();
    vi.mocked(loadTypeRegistry).mockClear();

    expect(repo.getType("tarea")).toBeDefined();
    const task = repo.createObject({
      title: "Con tipo",
      type: "tarea",
      attributes: { estado: "pendiente" },
    });
    repo.updateObject(task.id, { attributes: { estado: "en curso" } });

    expect(vi.mocked(loadTypeRegistry).mock.calls).toHaveLength(1);

    writeFileSync(
      join(vaultDir, "tipos", "propio.yaml"),
      "id: propio\nnombre: Propio\natributos: []\n",
      "utf8",
    );

    expect(repo.getType("propio")).toBeUndefined();
    expect(captureError(() => repo.createObject({ title: "X", type: "propio" })).key).toBe(
      "error.invalidObjectWrite",
    );
    expect(vi.mocked(loadTypeRegistry).mock.calls).toHaveLength(1);

    expect(repo.listTypes().map((type) => type.id)).toContain("propio");
    expect(vi.mocked(loadTypeRegistry).mock.calls).toHaveLength(2);
    expect(repo.listTypeWarnings()).toEqual([]);
    expect(vi.mocked(loadTypeRegistry).mock.calls).toHaveLength(3);
    expect(repo.getType("propio")).toBeDefined();
    expect(vi.mocked(loadTypeRegistry).mock.calls).toHaveLength(3);
  });

  it("resolves an object by title for the wikilink layer", () => {
    const { repo } = setupVault();
    const note = repo.createObject({ title: "Único título" });

    expect(repo.findObjectByTitle("Único título")?.path).toBe(note.path);
    expect(repo.findObjectByTitle("Otro título")).toBeUndefined();
  });
});
