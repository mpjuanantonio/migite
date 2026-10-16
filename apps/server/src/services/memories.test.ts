import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { guardarMemoria, type IndexHandle, openIndex } from "@migite/index";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { actualizarMemoria, borrarMemoria, listarMemorias, MemoriaError } from "./memories.js";

const FALTANTE = "01JXK2P4R5S6T7U8V9W0X1Y2Z";

let directory: string;
let handle: IndexHandle;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "migite-memorias-servicio-"));
  handle = openIndex({ dbPath: join(directory, "index.db") });
});

afterEach(() => {
  handle.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("listarMemorias", () => {
  it("devuelve las memorias del índice", () => {
    const guardada = guardarMemoria(handle.db, { clave: "ciudad", contenido: "Sevilla" });

    expect(listarMemorias({ db: handle.db })).toEqual([guardada]);
  });

  it("devuelve una lista vacía sin memorias", () => {
    expect(listarMemorias({ db: handle.db })).toEqual([]);
  });
});

describe("actualizarMemoria", () => {
  it("actualiza el contenido y devuelve la memoria", () => {
    const guardada = guardarMemoria(handle.db, { clave: "ciudad", contenido: "Sevilla" });

    const actualizada = actualizarMemoria({ db: handle.db }, guardada.id, "Granada");

    expect(actualizada.id).toBe(guardada.id);
    expect(actualizada.clave).toBe("ciudad");
    expect(actualizada.contenido).toBe("Granada");
  });

  it("lanza memory_not_found si la memoria no existe", () => {
    expect(() => actualizarMemoria({ db: handle.db }, FALTANTE, "algo")).toThrow(MemoriaError);
    try {
      actualizarMemoria({ db: handle.db }, FALTANTE, "algo");
    } catch (error) {
      expect((error as MemoriaError).codigo).toBe("memory_not_found");
    }
  });
});

describe("borrarMemoria", () => {
  it("borra la memoria existente", () => {
    const guardada = guardarMemoria(handle.db, { clave: "ciudad", contenido: "Sevilla" });

    borrarMemoria({ db: handle.db }, guardada.id);

    expect(listarMemorias({ db: handle.db })).toEqual([]);
  });

  it("lanza memory_not_found si la memoria no existe", () => {
    expect(() => borrarMemoria({ db: handle.db }, FALTANTE)).toThrow(MemoriaError);
  });
});
