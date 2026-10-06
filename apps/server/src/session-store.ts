import { type IndexDatabase, meta } from "@migite/index";
import { eq } from "drizzle-orm";
import { SESSION_GENERATION_KEY, type SessionStore } from "./auth.js";

const readGeneration = (db: IndexDatabase): number => {
  const stored = db
    .select({ valor: meta.valor })
    .from(meta)
    .where(eq(meta.clave, SESSION_GENERATION_KEY))
    .get()?.valor;
  if (stored === undefined) {
    return 0;
  }
  const generation = Number(stored);
  return Number.isSafeInteger(generation) && generation >= 0 ? generation : 0;
};

export const createIndexSessionStore = (db: IndexDatabase): SessionStore => ({
  generacion: () => readGeneration(db),
  invalidar: () => {
    const generation = readGeneration(db) + 1;
    db.insert(meta)
      .values({ clave: SESSION_GENERATION_KEY, valor: String(generation) })
      .onConflictDoUpdate({ target: meta.clave, set: { valor: String(generation) } })
      .run();
    return generation;
  },
});
