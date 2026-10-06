import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type ObjectFrontmatter, parseObjectFile } from "../frontmatter/index.js";
import { t } from "../i18n/index.js";
import {
  type AttributeTray,
  bootstrapVault,
  createAttributeTray,
  createObjectRepository,
  ObjectOperationError,
  type ObjectRecord,
  type ObjectRepository,
  type ReadObjectResult,
} from "./index.js";

const roots: string[] = [];

const setupVault = (
  timeZone = "Europe/Madrid",
): {
  vaultDir: string;
  repo: ObjectRepository;
  tray: AttributeTray;
} => {
  const vaultDir = mkdtempSync(join(tmpdir(), "migite-tray-"));
  roots.push(vaultDir);
  bootstrapVault(vaultDir);
  const repo = createObjectRepository({ vaultDir, timeZone });
  return { vaultDir, repo, tray: createAttributeTray(repo) };
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
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("addAttribute", () => {
  it("adds a free attribute keeping the type and leaving sibling objects untouched", () => {
    const { vaultDir, repo, tray } = setupVault();
    const first = repo.createObject({
      title: "Comprar pan",
      type: "tarea",
      body: "Ir al horno.\n",
      links: ["[[Lista de la compra]]"],
      attributes: { estado: "pendiente" },
    });
    const second = repo.createObject({
      title: "Lavar coche",
      type: "tarea",
      attributes: { estado: "pendiente" },
    });
    const secondText = readFileSync(join(vaultDir, second.path), "utf8");

    const updated = tray.addAttribute(first.id, "presupuesto", 1200);

    expect(updated.type).toBe("tarea");
    expect(updated.attributes).toEqual({ estado: "pendiente", presupuesto: 1200 });
    expect(updated.body).toBe("Ir al horno.\n");
    expect(updated.links).toEqual(["[[Lista de la compra]]"]);
    expect(parseVaultFile(vaultDir, first.path).frontmatter.type).toBe("tarea");
    expect(parseVaultFile(vaultDir, first.path).frontmatter.attributes).toEqual({
      estado: "pendiente",
      presupuesto: 1200,
    });
    expect(readOk(repo.readObject(first.id)).attributes).toEqual({
      estado: "pendiente",
      presupuesto: 1200,
    });
    expect(readFileSync(join(vaultDir, second.path), "utf8")).toBe(secondText);
    expect(readOk(repo.readObject(second.id)).attributes).toEqual({ estado: "pendiente" });
  });

  it("adds a declared attribute and resolves references by title and by path", () => {
    const { repo, tray } = setupVault();
    const task = repo.createObject({
      title: "Comprar pan",
      type: "tarea",
      attributes: { estado: "pendiente" },
    });
    const note = repo.createObject({ title: "Llamar al banco", body: "cuerpo\n" });

    expect(tray.addAttribute(task.id, "vencimiento", "2026-10-10").attributes).toEqual({
      estado: "pendiente",
      vencimiento: "2026-10-10",
    });
    expect(tray.addAttribute("Comprar pan", "estado", "en curso").attributes.estado).toBe(
      "en curso",
    );
    expect(tray.addAttribute(note.path, "urgente", true).attributes).toEqual({ urgente: true });
    expect(readOk(repo.readObject("Llamar al banco")).attributes).toEqual({ urgente: true });
  });

  it("overwrites an existing attribute instead of duplicating it", () => {
    const { repo, tray } = setupVault();
    const note = repo.createObject({ title: "Notas sueltas" });

    tray.addAttribute(note.id, "notas", "primera");
    const updated = tray.addAttribute(note.id, "notas", "segunda");

    expect(Object.keys(updated.attributes)).toEqual(["notas"]);
    expect(updated.attributes).toEqual({ notas: "segunda" });
    expect(readOk(repo.readObject(note.id)).attributes).toEqual({ notas: "segunda" });
  });

  it("rejects a value outside the declared options and leaves the object intact", () => {
    const { vaultDir, repo, tray } = setupVault();
    const task = repo.createObject({
      title: "Comprar pan",
      type: "tarea",
      attributes: { estado: "pendiente" },
    });
    const before = readFileSync(join(vaultDir, task.path), "utf8");

    const error = captureError(() => tray.addAttribute(task.id, "estado", "hechisima"));

    expect(error.key).toBe("error.invalidObjectWrite");
    expect(error.problems.join(" ")).toContain('attribute "estado"');
    expect(error.problems.join(" ")).toContain(
      'value "hechisima" is not one of the declared options',
    );
    expect(readFileSync(join(vaultDir, task.path), "utf8")).toBe(before);
    expect(readOk(repo.readObject(task.id)).attributes).toEqual({ estado: "pendiente" });
  });

  it("rejects a free value that is not JSON-compatible and keeps the previous value", () => {
    const { vaultDir, repo, tray } = setupVault();
    const note = repo.createObject({ title: "Factura", attributes: { total: 30 } });
    const before = readFileSync(join(vaultDir, note.path), "utf8");

    const error = captureError(() =>
      tray.addAttribute(note.id, "cuando", new Date("2026-10-05T00:00:00Z")),
    );

    expect(error.key).toBe("error.invalidObjectWrite");
    expect(error.problems.join(" ")).toContain('attribute "cuando"');
    expect(error.problems.join(" ")).toContain("JSON-compatible");
    expect(readFileSync(join(vaultDir, note.path), "utf8")).toBe(before);
    expect(readOk(repo.readObject(note.id)).attributes).toEqual({ total: 30 });
  });

  it("rejects reserved keys with the reserved key error", () => {
    const { vaultDir, repo, tray } = setupVault();
    const note = repo.createObject({ title: "Reservada" });
    const before = readFileSync(join(vaultDir, note.path), "utf8");

    const error = captureError(() => tray.addAttribute(note.id, "titulo", "usurpado"));

    expect(error.key).toBe("error.reservedAttributeKey");
    expect(error.message).toBe(t("error.reservedAttributeKey", { key: "titulo" }));
    expect(readFileSync(join(vaultDir, note.path), "utf8")).toBe(before);
    expect(readOk(repo.readObject(note.id)).attributes).toEqual({});
  });

  it("rejects an empty key", () => {
    const { repo, tray } = setupVault();
    const note = repo.createObject({ title: "Clave vacía" });

    const error = captureError(() => tray.addAttribute(note.id, "   ", 1));

    expect(error.key).toBe("error.invalidObjectWrite");
    expect(error.problems.join(" ")).toContain("attribute key must not be empty");
  });

  it("rejects an explicit undefined and points at removeAttribute", () => {
    const { repo, tray } = setupVault();
    const note = repo.createObject({ title: "Sin valor", attributes: { previo: "valor" } });

    const error = captureError(() => tray.addAttribute(note.id, "previo", undefined));

    expect(error.key).toBe("error.invalidObjectWrite");
    expect(error.problems.join(" ")).toContain('attribute "previo" requires a value');
    expect(error.problems.join(" ")).toContain("use removeAttribute to delete it");
    expect(readOk(repo.readObject(note.id)).attributes).toEqual({ previo: "valor" });
  });

  it("refuses to write when a raw invalid value would be destroyed", () => {
    const { vaultDir, repo, tray } = setupVault();
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

    const error = captureError(() => tray.addAttribute("crudo.md", "presupuesto", 10));

    expect(error.key).toBe("error.invalidObjectWrite");
    expect(error.problems.join(" ")).toContain(
      'value "no-declarado" is not one of the declared options',
    );
    expect(readFileSync(join(vaultDir, "crudo.md"), "utf8")).toBe(raw);
    expect(readOk(repo.readObject("crudo.md")).attributes.estado).toBe("no-declarado");
  });
});

describe("setAttribute", () => {
  it("adds and overwrites with the same validation as addAttribute", () => {
    const { vaultDir, repo, tray } = setupVault();
    const note = repo.createObject({ title: "Azúcar" });

    expect(tray.setAttribute(note.id, "prioridad", "alta").attributes).toEqual({
      prioridad: "alta",
    });
    expect(tray.setAttribute(note.id, "prioridad", "baja").attributes).toEqual({
      prioridad: "baja",
    });
    expect(parseVaultFile(vaultDir, note.path).frontmatter.attributes).toEqual({
      prioridad: "baja",
    });

    const error = captureError(() => tray.setAttribute(note.id, "prioridad", undefined));

    expect(error.key).toBe("error.invalidObjectWrite");
    expect(error.problems.join(" ")).toContain("use removeAttribute to delete it");
    expect(readOk(repo.readObject(note.id)).attributes).toEqual({ prioridad: "baja" });
  });
});

describe("removeAttribute", () => {
  it("removes a free attribute the type does not declare and keeps the type", () => {
    const { vaultDir, repo, tray } = setupVault();
    const task = repo.createObject({
      title: "Comprar pan",
      type: "tarea",
      attributes: { estado: "pendiente" },
    });
    tray.addAttribute(task.id, "presupuesto", 1200);

    const updated = tray.removeAttribute(task.id, "presupuesto");

    expect(updated.type).toBe("tarea");
    expect(updated.attributes).toEqual({ estado: "pendiente" });
    expect(parseVaultFile(vaultDir, task.path).frontmatter.type).toBe("tarea");
    expect(parseVaultFile(vaultDir, task.path).frontmatter.attributes).toEqual({
      estado: "pendiente",
    });
    expect(readOk(repo.readObject(task.id)).attributes).toEqual({ estado: "pendiente" });
  });

  it("removes a declared optional attribute", () => {
    const { repo, tray } = setupVault();
    const task = repo.createObject({
      title: "Comprar pan",
      type: "tarea",
      attributes: { estado: "pendiente", vencimiento: "2026-10-10" },
    });

    const updated = tray.removeAttribute(task.id, "vencimiento");

    expect(updated.attributes).toEqual({ estado: "pendiente" });
    expect(readOk(repo.readObject(task.id)).attributes).toEqual({ estado: "pendiente" });
  });

  it("rejects removing a required attribute of the type and leaves the object intact", () => {
    const { vaultDir, repo, tray } = setupVault();
    const task = repo.createObject({
      title: "Comprar pan",
      type: "tarea",
      attributes: { estado: "pendiente" },
    });
    const before = readFileSync(join(vaultDir, task.path), "utf8");

    const error = captureError(() => tray.removeAttribute(task.id, "estado"));

    expect(error.key).toBe("error.invalidObjectWrite");
    expect(error.problems.join(" ")).toContain('required attribute "estado" of type "tarea"');
    expect(error.problems.join(" ")).toContain("cannot be removed");
    expect(readFileSync(join(vaultDir, task.path), "utf8")).toBe(before);
    expect(readOk(repo.readObject(task.id)).attributes).toEqual({ estado: "pendiente" });
  });

  it("returns the object unchanged when the attribute is absent", () => {
    const { vaultDir, repo, tray } = setupVault();
    const note = repo.createObject({ title: "Sin atributos" });
    const before = readFileSync(join(vaultDir, note.path), "utf8");

    const updated = tray.removeAttribute(note.id, "fantasma");

    expect(updated.id).toBe(note.id);
    expect(updated.attributes).toEqual({});
    expect(updated.updated).toBe(note.updated);
    expect(readFileSync(join(vaultDir, note.path), "utf8")).toBe(before);
  });

  it("rejects reserved keys instead of silently ignoring them", () => {
    const { repo, tray } = setupVault();
    const note = repo.createObject({ title: "Reservada" });

    const error = captureError(() => tray.removeAttribute(note.id, "titulo"));

    expect(error.key).toBe("error.reservedAttributeKey");
    expect(error.message).toBe(t("error.reservedAttributeKey", { key: "titulo" }));
    expect(readOk(repo.readObject(note.id)).attributes).toEqual({});
  });
});

describe("tray references", () => {
  it("throws objectNotFound for an unknown reference", () => {
    const { tray } = setupVault();

    expect(captureError(() => tray.addAttribute("no-existe", "k", 1)).key).toBe(
      "error.objectNotFound",
    );
    expect(captureError(() => tray.setAttribute("no-existe", "k", 1)).key).toBe(
      "error.objectNotFound",
    );
    expect(captureError(() => tray.removeAttribute("no-existe", "k")).key).toBe(
      "error.objectNotFound",
    );
  });

  it("throws ambiguousTitle when a title matches several objects", () => {
    const { vaultDir, repo, tray } = setupVault();
    const first = repo.createObject({ title: "Duplicada", body: "primera\n" });
    const second = repo.createObject({
      title: "Duplicada",
      folder: "archivadas",
      body: "segunda\n",
    });
    const firstText = readFileSync(join(vaultDir, first.path), "utf8");
    const secondText = readFileSync(join(vaultDir, second.path), "utf8");

    expect(captureError(() => tray.addAttribute("Duplicada", "k", 1)).key).toBe(
      "error.ambiguousTitle",
    );
    expect(captureError(() => tray.removeAttribute("Duplicada", "k")).key).toBe(
      "error.ambiguousTitle",
    );
    expect(readFileSync(join(vaultDir, first.path), "utf8")).toBe(firstText);
    expect(readFileSync(join(vaultDir, second.path), "utf8")).toBe(secondText);
  });
});
