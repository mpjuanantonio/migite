import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IndexError, type IndexHandle, openIndex, SCHEMA_VERSION } from "./open.js";
import { meta } from "./schema.js";

const EXPECTED_TABLES = [
  "acciones",
  "atributos",
  "conversaciones",
  "embeddings",
  "enlaces",
  "fragmentos",
  "fts_objetos",
  "mensajes",
  "meta",
  "objetos",
] as const;

let directory: string;
let opened: IndexHandle | undefined;

const dbPath = (): string => join(directory, "index.db");

const open = (path = dbPath()): IndexHandle => {
  const handle = openIndex({ dbPath: path });
  opened = handle;
  return handle;
};

const tableNames = (handle: IndexHandle): ReadonlySet<string> => {
  const rows = handle.db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table'`,
  );
  return new Set(rows.map((row) => row.name));
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "migite-index-"));
  opened = undefined;
});

afterEach(() => {
  opened?.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("openIndex", () => {
  it("creates every indexed entity after migrating", () => {
    const names = tableNames(open());

    for (const table of EXPECTED_TABLES) {
      expect(names).toContain(table);
    }
  });

  it("creates fts_objetos as an FTS5 virtual table", () => {
    const handle = open();
    const row = handle.db.get<{ sql: string }>(
      sql`SELECT sql FROM sqlite_master WHERE name = 'fts_objetos'`,
    );

    expect(row?.sql).toContain("fts5");
  });

  it("searches title, body and attribute values through fts_objetos", () => {
    const handle = open();
    handle.db.run(
      sql`INSERT INTO fts_objetos (objeto_id, titulo, cuerpo, atributos)
          VALUES ('01H0000000000000000000000', 'Manual de Migite', 'El cuerpo habla de indices', 'rust, sqlite')`,
    );

    const byBody = handle.db.all<{ objeto_id: string }>(
      sql`SELECT objeto_id FROM fts_objetos WHERE fts_objetos MATCH 'indices'`,
    );
    const byTitle = handle.db.all<{ objeto_id: string }>(
      sql`SELECT objeto_id FROM fts_objetos WHERE fts_objetos MATCH 'manual'`,
    );
    const byAttribute = handle.db.all<{ objeto_id: string }>(
      sql`SELECT objeto_id FROM fts_objetos WHERE fts_objetos MATCH 'sqlite'`,
    );

    expect(byBody).toHaveLength(1);
    expect(byTitle).toHaveLength(1);
    expect(byAttribute).toHaveLength(1);
  });

  it("enables WAL and foreign keys", () => {
    const handle = open();

    expect(handle.db.get(sql`PRAGMA journal_mode`)).toEqual({ journal_mode: "wal" });
    expect(handle.db.get(sql`PRAGMA foreign_keys`)).toEqual({ foreign_keys: 1 });
  });

  it("seeds meta.schema_version once", () => {
    const handle = open();
    const rows = handle.db.select().from(meta).where(eq(meta.clave, "schema_version")).all();

    expect(rows).toEqual([{ clave: "schema_version", valor: String(SCHEMA_VERSION) }]);
  });

  it("is idempotent and keeps data when reopening the same database", () => {
    const first = open();
    first.db.insert(meta).values({ clave: "embedding_model", valor: "nomic-embed" }).run();
    first.close();

    const second = open();
    const version = second.db.select().from(meta).where(eq(meta.clave, "schema_version")).all();
    const model = second.db.select().from(meta).where(eq(meta.clave, "embedding_model")).all();

    expect(tableNames(second)).toContain("objetos");
    expect(version).toHaveLength(1);
    expect(model).toEqual([{ clave: "embedding_model", valor: "nomic-embed" }]);
  });

  it("closes the connection only once", () => {
    const handle = open();

    handle.close();

    expect(() => handle.close()).not.toThrow();
  });

  it("rejects an empty path", () => {
    expect(() => openIndex({ dbPath: "   " })).toThrow(IndexError);
  });

  it("fails with a clear error when the parent path is not a directory", () => {
    const file = join(directory, "not-a-directory");
    writeFileSync(file, "text");

    expect(() => openIndex({ dbPath: join(file, "index.db") })).toThrow(IndexError);
  });

  it("fails with a clear error when the path is a directory", () => {
    expect(() => openIndex({ dbPath: directory })).toThrow(IndexError);
  });

  it("fails with a clear error when the database is corrupt", () => {
    const corrupt = join(directory, "corrupt.db");
    writeFileSync(corrupt, "this is not a sqlite database");

    expect(() => openIndex({ dbPath: corrupt })).toThrow(IndexError);
  });
});
