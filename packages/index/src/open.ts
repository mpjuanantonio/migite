import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";
import { meta } from "./schema.js";

export const SCHEMA_VERSION = 1;

export const SCHEMA_VERSION_KEY = "schema_version";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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

const prepareDirectory = (dbPath: string): void => {
  try {
    mkdirSync(dirname(dbPath), { recursive: true });
  } catch (error) {
    throw new IndexError(
      `No se pudo crear el directorio del índice "${dirname(dbPath)}": ${describeError(error)}`,
      { cause: error },
    );
  }
};

const configure = (connection: Database.Database): void => {
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  connection.pragma("busy_timeout = 5000");
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
    throw new IndexError(
      `No se pudo abrir la base de datos del índice en "${resolved}": ${describeError(error)}`,
      { cause: error },
    );
  }

  try {
    configure(connection);
    const db = drizzle(connection, { schema });
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    seedSchemaVersion(db);
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
    throw new IndexError(
      `No se pudo inicializar el índice en "${resolved}": ${describeError(error)}`,
      { cause: error },
    );
  }
};
