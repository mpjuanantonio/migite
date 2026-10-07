import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type IndexHandle, meta, openIndex } from "@migite/index";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SESSION_GENERATION_KEY } from "./auth.js";
import { createIndexSessionStore } from "./session-store.js";

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
});
