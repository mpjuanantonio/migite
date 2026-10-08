import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type IndexHandle, meta, openIndex } from "@migite/index";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SESSION_GENERATION_KEY } from "./auth.js";
import {
  AUTH_PASSWORD_HASH_KEY,
  AUTH_USERNAME_KEY,
  createIndexSessionStore,
  SESSION_SECRET_KEY,
} from "./session-store.js";

const DESDE_2023 = 1_700_000_000_000;

let root: string;
let handle: IndexHandle;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "migite-session-store-"));
  handle = openIndex({ dbPath: join(root, "index.db") });
});

afterEach(() => {
  handle.close();
  rmSync(root, { recursive: true, force: true });
});

describe("createIndexSessionStore", () => {
  it("siembra la generación inicial con la fecha actual si la clave no existe", () => {
    const store = createIndexSessionStore(handle.db);

    const generacion = store.generacion();
    expect(generacion).toBeGreaterThanOrEqual(DESDE_2023);
    expect(generacion).toBeLessThanOrEqual(Date.now());
  });

  it("no acepta la generación cero de una base restaurada", () => {
    expect(createIndexSessionStore(handle.db).generacion()).not.toBe(0);
  });

  it("increments the generation on every invalidation", () => {
    const store = createIndexSessionStore(handle.db);
    const inicial = store.generacion();

    expect(store.invalidar()).toBe(inicial + 1);
    expect(store.invalidar()).toBe(inicial + 2);
    expect(store.generacion()).toBe(inicial + 2);
  });

  it("persists the generation in the index meta table", () => {
    const inicial = createIndexSessionStore(handle.db).generacion();
    createIndexSessionStore(handle.db).invalidar();
    handle.close();
    handle = openIndex({ dbPath: join(root, "index.db") });

    expect(createIndexSessionStore(handle.db).generacion()).toBe(inicial + 1);
  });

  it("reseeda la generación si el valor guardado no es válido", () => {
    handle.db
      .insert(meta)
      .values({ clave: SESSION_GENERATION_KEY, valor: "no-es-un-numero" })
      .run();

    expect(createIndexSessionStore(handle.db).generacion()).toBeGreaterThanOrEqual(DESDE_2023);
  });

  it("genera un secreto de sesión y lo mantiene entre reinicios", () => {
    const generado = createIndexSessionStore(handle.db).secretoSesion;
    expect(generado).toMatch(/^[0-9a-f]{64}$/);

    handle.close();
    handle = openIndex({ dbPath: join(root, "index.db") });

    expect(createIndexSessionStore(handle.db).secretoSesion).toBe(generado);
  });

  it("prioriza el secreto del entorno sin persistirlo en meta", () => {
    const delEntorno = "secreto-de-test-suficientemente-largo";
    const store = createIndexSessionStore(handle.db, { secretoSesion: delEntorno });

    expect(store.secretoSesion).toBe(delEntorno);
    const guardado = handle.db
      .select({ valor: meta.valor })
      .from(meta)
      .where(eq(meta.clave, SESSION_SECRET_KEY))
      .get();
    expect(guardado).toBeUndefined();
  });

  it("no hay credenciales mientras no se defina el setup", () => {
    expect(createIndexSessionStore(handle.db).credenciales()).toBeUndefined();
  });

  it("persiste y relee las credenciales definidas en el setup", () => {
    const store = createIndexSessionStore(handle.db);
    store.definirCredenciales({ usuario: "ana", passwordHash: "$argon2id$v=19$test" });

    handle.close();
    handle = openIndex({ dbPath: join(root, "index.db") });

    expect(createIndexSessionStore(handle.db).credenciales()).toEqual({
      usuario: "ana",
      passwordHash: "$argon2id$v=19$test",
    });
  });

  it("ignora credenciales persistidas incompletas", () => {
    handle.db.insert(meta).values({ clave: AUTH_USERNAME_KEY, valor: "ana" }).run();

    expect(createIndexSessionStore(handle.db).credenciales()).toBeUndefined();
  });

  it("prioriza las credenciales del entorno sobre las persistidas", () => {
    handle.db.insert(meta).values({ clave: AUTH_USERNAME_KEY, valor: "meta" }).run();
    handle.db.insert(meta).values({ clave: AUTH_PASSWORD_HASH_KEY, valor: "$argon2id$meta" }).run();

    const store = createIndexSessionStore(handle.db, {
      credentials: { usuario: "entorno", passwordHash: "$argon2id$entorno" },
    });

    expect(store.credenciales()).toEqual({
      usuario: "entorno",
      passwordHash: "$argon2id$entorno",
    });
  });
});
