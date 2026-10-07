import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapVault, createObjectRepository, type ObjectRepository } from "@migite/core";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildIndex, reconcileIndex, runReindex } from "./indexer.js";
import { type IndexHandle, openIndex } from "./open.js";

type ObjectRow = {
  id: string;
  tipo_id: string;
  titulo: string;
  ruta: string;
  hash: string;
};

type LinkRow = {
  origen_id: string;
  destino_id: string;
  contexto: string;
};

let directory: string;
let vaultDir: string;
let handle: IndexHandle;
let repo: ObjectRepository;
let external: ObjectRepository;

const dbPath = (): string => join(directory, "index.db");

const fileHash = (relativePath: string): string =>
  createHash("sha256")
    .update(readFileSync(join(vaultDir, relativePath), "utf8"))
    .digest("hex");

const objectRows = (): ObjectRow[] =>
  handle.db.all<ObjectRow>(sql`SELECT id, tipo_id, titulo, ruta, hash FROM objetos ORDER BY id`);

const linkRows = (): LinkRow[] =>
  handle.db.all<LinkRow>(sql`SELECT origen_id, destino_id, contexto FROM enlaces`);

const ftsIds = (term: string): string[] =>
  handle.db
    .all<{ objeto_id: string }>(
      sql`SELECT objeto_id FROM fts_objetos WHERE fts_objetos MATCH ${term}`,
    )
    .map((row) => row.objeto_id)
    .sort();

const snapshot = (): unknown => ({
  objects: objectRows(),
  links: linkRows(),
  fts: handle.db.all(
    sql`SELECT objeto_id, titulo, cuerpo, atributos FROM fts_objetos ORDER BY objeto_id`,
  ),
});

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "migite-reconcile-"));
  vaultDir = join(directory, "vault");
  bootstrapVault(vaultDir);
  repo = createObjectRepository({ vaultDir, timeZone: "UTC" });
  external = createObjectRepository({ vaultDir, timeZone: "UTC" });
  handle = openIndex({ dbPath: dbPath() });
});

afterEach(() => {
  handle.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("reconcileIndex", () => {
  it("detects created, modified and deleted files by hash", () => {
    const destino = repo.createObject({ title: "Destino", type: "nota" });
    const origen = repo.createObject({
      title: "Origen",
      type: "nota",
      body: "alfa [[Destino]]",
    });
    buildIndex(handle.db, { vaultDir });
    expect(ftsIds("alfa")).toEqual([origen.id]);

    const nueva = external.createObject({
      title: "Nueva",
      type: "nota",
      body: "zeta [[Destino]]",
    });
    external.updateObject(destino.id, { body: "gamma" });
    external.deleteObject(origen.id);

    const summary = reconcileIndex(handle.db, { vaultDir });

    expect(summary).toEqual({ created: 1, updated: 1, deleted: 1 });
    expect(
      objectRows()
        .map((row) => row.id)
        .sort(),
    ).toEqual([destino.id, nueva.id].sort());
    expect(objectRows().find((row) => row.id === destino.id)).toMatchObject({
      ruta: destino.path,
      hash: fileHash(destino.path),
    });
    expect(objectRows().find((row) => row.id === nueva.id)?.hash).toBe(fileHash(nueva.path));
    expect(ftsIds("gamma")).toEqual([destino.id]);
    expect(ftsIds("zeta")).toEqual([nueva.id]);
    expect(ftsIds("alfa")).toEqual([]);
    expect(linkRows()).toEqual([
      { origen_id: nueva.id, destino_id: destino.id, contexto: "cuerpo" },
    ]);
  });

  it("is a no-op when the index already matches the vault", () => {
    repo.createObject({ title: "Destino", type: "nota" });
    repo.createObject({ title: "Origen", type: "nota", body: "[[Destino]]" });
    buildIndex(handle.db, { vaultDir });
    const before = snapshot();

    const first = reconcileIndex(handle.db, { vaultDir });
    const second = reconcileIndex(handle.db, { vaultDir });

    expect(first).toEqual({ created: 0, updated: 0, deleted: 0 });
    expect(second).toEqual({ created: 0, updated: 0, deleted: 0 });
    expect(snapshot()).toEqual(before);
  });

  it("tracks files moved on disk without content changes", () => {
    const created = repo.createObject({ title: "Movible", type: "nota" });
    buildIndex(handle.db, { vaultDir });

    renameSync(join(vaultDir, created.path), join(vaultDir, "movido.md"));
    const summary = reconcileIndex(handle.db, { vaultDir });

    expect(summary).toEqual({ created: 0, updated: 1, deleted: 0 });
    expect(objectRows()).toHaveLength(1);
    expect(objectRows()[0]?.ruta).toBe("movido.md");
    expect(objectRows()[0]?.hash).toBe(fileHash("movido.md"));
  });
});

describe("runReindex", () => {
  it("rebuilds the whole index and reports the number of objects", () => {
    const destino = repo.createObject({ title: "Destino", type: "nota" });
    const origen = repo.createObject({ title: "Origen", type: "nota", body: "[[Destino]]" });
    buildIndex(handle.db, { vaultDir });

    external.deleteObject(origen.id);
    const summary = runReindex(handle.db, { vaultDir });

    expect(summary).toEqual({ total: 1 });
    expect(objectRows().map((row) => row.id)).toEqual([destino.id]);
    expect(linkRows()).toEqual([]);
  });
});
