import { type IndexDatabase, meta } from "@migite/index";
import { eq } from "drizzle-orm";
import { SESSION_GENERATION_KEY, type SessionStore } from "./auth.js";

const writeGeneration = (db: IndexDatabase, generation: number): void => {
  db.insert(meta)
    .values({ clave: SESSION_GENERATION_KEY, valor: String(generation) })
    .onConflictDoUpdate({ target: meta.clave, set: { valor: String(generation) } })
    .run();
};

const readGeneration = (db: IndexDatabase): number => {
  const stored = db
    .select({ valor: meta.valor })
    .from(meta)
    .where(eq(meta.clave, SESSION_GENERATION_KEY))
    .get()?.valor;
  const generation =
    stored === undefined || stored.trim().length === 0 ? Number.NaN : Number(stored);
  if (Number.isSafeInteger(generation) && generation >= 0) {
    return generation;
  }
  const seeded = Date.now();
  writeGeneration(db, seeded);
  return seeded;
};

export const createIndexSessionStore = (db: IndexDatabase): SessionStore => {
  readGeneration(db);
  return {
    generacion: () => readGeneration(db),
    invalidar: () => {
      const generation = readGeneration(db) + 1;
      writeGeneration(db, generation);
      return generation;
    },
  };
};
