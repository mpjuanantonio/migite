import { randomBytes } from "node:crypto";
import { type IndexDatabase, meta } from "@migite/index";
import { eq } from "drizzle-orm";
import {
  type AuthCredentials,
  type AuthEnvConfig,
  SESSION_GENERATION_KEY,
  type SessionStore,
} from "./auth.js";

export const SESSION_SECRET_KEY = "session_secret";
export const AUTH_USERNAME_KEY = "auth.username";
export const AUTH_PASSWORD_HASH_KEY = "auth.password_hash";

const SECRET_BYTES = 32;

const readMetaValue = (db: IndexDatabase, clave: string): string | undefined => {
  const valor = db
    .select({ valor: meta.valor })
    .from(meta)
    .where(eq(meta.clave, clave))
    .get()?.valor;
  return valor === undefined || valor.length === 0 ? undefined : valor;
};

const writeMetaValue = (db: IndexDatabase, clave: string, valor: string): void => {
  db.insert(meta)
    .values({ clave, valor })
    .onConflictDoUpdate({ target: meta.clave, set: { valor } })
    .run();
};

const writeGeneration = (db: IndexDatabase, generation: number): void => {
  writeMetaValue(db, SESSION_GENERATION_KEY, String(generation));
};

const readGeneration = (db: IndexDatabase): number => {
  const stored = readMetaValue(db, SESSION_GENERATION_KEY);
  const generation = stored === undefined ? Number.NaN : Number(stored);
  if (Number.isSafeInteger(generation) && generation >= 0) {
    return generation;
  }
  const seeded = Date.now();
  writeGeneration(db, seeded);
  return seeded;
};

const readStoredCredentials = (db: IndexDatabase): AuthCredentials | undefined => {
  const usuario = readMetaValue(db, AUTH_USERNAME_KEY)?.trim();
  const passwordHash = readMetaValue(db, AUTH_PASSWORD_HASH_KEY)?.trim();
  if (usuario === undefined || usuario.length === 0 || passwordHash === undefined) {
    return undefined;
  }
  return { usuario, passwordHash };
};

const writeCredentials = (db: IndexDatabase, credentials: AuthCredentials): void => {
  writeMetaValue(db, AUTH_USERNAME_KEY, credentials.usuario);
  writeMetaValue(db, AUTH_PASSWORD_HASH_KEY, credentials.passwordHash);
};

const readOrCreateSessionSecret = (db: IndexDatabase): string => {
  const stored = readMetaValue(db, SESSION_SECRET_KEY);
  if (stored !== undefined) {
    return stored;
  }
  const generated = randomBytes(SECRET_BYTES).toString("hex");
  writeMetaValue(db, SESSION_SECRET_KEY, generated);
  return generated;
};

export const createIndexSessionStore = (
  db: IndexDatabase,
  options: AuthEnvConfig = {},
): SessionStore => {
  readGeneration(db);
  const secretoSesion = options.secretoSesion ?? readOrCreateSessionSecret(db);
  return {
    generacion: () => readGeneration(db),
    invalidar: () => {
      const generation = readGeneration(db) + 1;
      writeGeneration(db, generation);
      return generation;
    },
    secretoSesion,
    credenciales: () => options.credentials ?? readStoredCredentials(db),
    definirCredenciales: (credentials) => {
      writeCredentials(db, credentials);
    },
  };
};
