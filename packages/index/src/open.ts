import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { eq, sql } from "drizzle-orm";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";
import { meta } from "./schema.js";

export const SCHEMA_VERSION = 1;

export const SCHEMA_VERSION_KEY = "schema_version";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

export class IndexError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IndexError";
  }
}

export type IndexDatabase = BetterSQLite3Database<typeof schema>;

export type OpenIndexOptions = {
  readonly dbPath: string;
};

export type IndexHandle = {
  readonly db: IndexDatabase;
  readonly dbPath: string;
  readonly close: () => void;
};

const restrictPermissions = (path: string, mode: number): void => {
  try {
    chmodSync(path, mode);
  } catch {
    return;
  }
};

const restrictIndexFiles = (dbPath: string): void => {
  for (const suffix of ["", "-wal", "-shm"]) {
    restrictPermissions(`${dbPath}${suffix}`, 0o600);
  }
};

const missingDirectories = (directory: string): readonly string[] => {
  const missing: string[] = [];
  let current = directory;
  while (!existsSync(current)) {
    missing.push(current);
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return missing;
};

const prepareDirectory = (dbPath: string): void => {
  const directory = dirname(dbPath);
  const created = missingDirectories(directory);
  try {
    mkdirSync(directory, { recursive: true });
  } catch (error) {
    throw new IndexError(`No se pudo crear el directorio del índice "${basename(dbPath)}".`, {
      cause: error,
    });
  }
  for (const createdDirectory of created) {
    restrictPermissions(createdDirectory, 0o700);
  }
  restrictIndexFiles(dbPath);
};

const configure = (connection: Database.Database): void => {
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  connection.pragma("busy_timeout = 5000");
  connection.pragma("trusted_schema = OFF");
};

const assertSupportedSchemaVersion = (db: IndexDatabase, dbPath: string): void => {
  const table = db.get<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'`,
  );
  if (table === undefined) {
    return;
  }
  const stored = db
    .select({ valor: meta.valor })
    .from(meta)
    .where(eq(meta.clave, SCHEMA_VERSION_KEY))
    .get()?.valor;
  if (stored === undefined) {
    return;
  }
  const version = Number(stored);
  if (Number.isInteger(version) && version > SCHEMA_VERSION) {
    throw new IndexError(
      `La base de datos del índice "${basename(dbPath)}" usa una versión de esquema (${version}) más nueva que la soportada (${SCHEMA_VERSION}).`,
    );
  }
};

const seedSchemaVersion = (db: IndexDatabase): void => {
  db.insert(meta)
    .values({ clave: SCHEMA_VERSION_KEY, valor: String(SCHEMA_VERSION) })
    .onConflictDoNothing()
    .run();
};

export const openIndex = ({ dbPath }: OpenIndexOptions): IndexHandle => {
  if (typeof dbPath !== "string" || dbPath.trim().length === 0) {
    throw new IndexError("La ruta de la base de datos del índice no puede estar vacía.");
  }

  const resolved = resolve(dbPath);
  prepareDirectory(resolved);

  let connection: Database.Database;
  try {
    connection = new Database(resolved);
  } catch (error) {
    throw new IndexError(`No se pudo abrir la base de datos del índice "${basename(resolved)}".`, {
      cause: error,
    });
  }
  restrictIndexFiles(resolved);

  try {
    configure(connection);
    const db = drizzle(connection, { schema });
    assertSupportedSchemaVersion(db, resolved);
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    seedSchemaVersion(db);
    restrictIndexFiles(resolved);
    return {
      db,
      dbPath: resolved,
      close: () => {
        if (connection.open) {
          connection.close();
        }
      },
    };
  } catch (error) {
    if (connection.open) {
      connection.close();
    }
    if (error instanceof IndexError) {
      throw error;
    }
    throw new IndexError(`No se pudo inicializar el índice "${basename(resolved)}".`, {
      cause: error,
    });
  }
};
