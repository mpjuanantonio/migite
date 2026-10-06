import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapVault, createObjectRepository, type ObjectRepository } from "@migite/core";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type IndexHandle, openIndex } from "./open.js";
import { startWatcher, type WatcherHandle } from "./watcher.js";

type LinkRow = {
  origen_id: string;
  destino_id: string;
  contexto: string;
};

let directory: string;
let vaultDir: string;
let handle: IndexHandle;
let watcher: WatcherHandle | undefined;
let repo: ObjectRepository;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (predicate: () => boolean, timeoutMs = 5000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("timed out waiting for the watcher");
    }
    await sleep(20);
  }
};

const objectIds = (): string[] =>
  handle.db.all<{ id: string }>(sql`SELECT id FROM objetos ORDER BY id`).map((row) => row.id);

const ftsIds = (term: string): string[] =>
  handle.db
    .all<{ objeto_id: string }>(
      sql`SELECT objeto_id FROM fts_objetos WHERE fts_objetos MATCH ${term}`,
    )
    .map((row) => row.objeto_id)
    .sort();

const linkRows = (): LinkRow[] =>
  handle.db.all<LinkRow>(sql`SELECT origen_id, destino_id, contexto FROM enlaces`);

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "migite-watcher-"));
  vaultDir = join(directory, "vault");
  bootstrapVault(vaultDir);
  repo = createObjectRepository({ vaultDir, timeZone: "UTC" });
  handle = openIndex({ dbPath: join(directory, "index.db") });
  watcher = startWatcher({
    db: handle.db,
    vaultDir,
    timeZone: "UTC",
    debounceMs: 20,
  });
});

afterEach(async () => {
  await watcher?.close();
  handle.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("startWatcher", () => {
  it("resolves ready when listening and synced after the startup reindex", async () => {
    const created = repo.createObject({ title: "Arranque", type: "nota", body: "inicial" });
    const started = startWatcher({ db: handle.db, vaultDir, timeZone: "UTC" });

    await started.ready;
    await started.synced;

    expect(objectIds()).toContain(created.id);
    expect(ftsIds("inicial")).toEqual([created.id]);

    await started.close();
  });

  it("indexes files created, edited and deleted after startup", async () => {
    const created = repo.createObject({ title: "Observada", type: "nota", body: "alfa" });
    await waitFor(() => objectIds().includes(created.id));
    expect(ftsIds("observada")).toEqual([created.id]);

    repo.updateObject(created.id, { body: "beta" });
    await waitFor(() => ftsIds("beta").includes(created.id));
    expect(ftsIds("alfa")).toEqual([]);

    repo.deleteObject(created.id);
    await waitFor(() => !objectIds().includes(created.id));
    expect(ftsIds("beta")).toEqual([]);
    expect(ftsIds("observada")).toEqual([]);
  });

  it("keeps backlinks fresh when a linked target is renamed", async () => {
    const destino = repo.createObject({ title: "Titulo viejo", type: "nota" });
    const origen = repo.createObject({
      title: "Fuente",
      type: "nota",
      body: "alfa [[Titulo viejo]]",
    });
    await waitFor(
      () => ftsIds("viejo").includes(origen.id) && ftsIds("viejo").includes(destino.id),
    );

    repo.renameObject(destino.id, "Titulo nuevo");

    await waitFor(() => ftsIds("viejo").length === 0);
    expect(ftsIds("nuevo").includes(origen.id)).toBe(true);
    expect(linkRows()).toEqual([
      { origen_id: origen.id, destino_id: destino.id, contexto: "cuerpo" },
    ]);
  });

  it("ignores markdown files inside reserved root folders", async () => {
    writeFileSync(join(vaultDir, "tipos", "reservada.md"), "# no es un objeto\n", "utf8");

    await sleep(300);

    expect(objectIds()).toEqual([]);
  });

  it("survives unreadable markdown files", async () => {
    const unreadable = join(vaultDir, "roto.md");
    writeFileSync(unreadable, "esto no es un objeto\n", "utf8");
    chmodSync(unreadable, 0o000);

    await sleep(300);
    const healthy = repo.createObject({ title: "Sana", type: "nota" });

    await waitFor(() => objectIds().includes(healthy.id));
  });
});
