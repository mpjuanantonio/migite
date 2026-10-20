import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isUlid } from "@migite/core";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  actualizarMemoria,
  borrarMemoria,
  guardarMemoria,
  listarMemorias,
  obtenerMemoria,
} from "./memories.js";
import { IndexError, type IndexHandle, openIndex } from "./open.js";

const MISSING_ID = "01J00000000000000000000000";

let directory: string;
let handle: IndexHandle;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "migite-memorias-"));
  handle = openIndex({ dbPath: join(directory, "index.db") });
});

afterEach(() => {
  handle.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("guardarMemoria", () => {
  it("guarda una memoria nueva con ULID y fecha ISO", () => {
    const memoria = guardarMemoria(handle.db, {
      clave: "  color favorito  ",
      contenido: "  azul  ",
    });

    expect(isUlid(memoria.id)).toBe(true);
    expect(memoria.clave).toBe("color favorito");
    expect(memoria.contenido).toBe("azul");
    expect(new Date(memoria.actualizada).toISOString()).toBe(memoria.actualizada);
    expect(obtenerMemoria(handle.db, memoria.id)).toEqual(memoria);
  });

  it("hace upsert por clave conservando el id y actualizando la fecha", () => {
    const original = guardarMemoria(handle.db, { clave: "ciudad", contenido: "Sevilla" });
    handle.db.run(
      sql`UPDATE memorias SET actualizada = '2020-01-01T00:00:00.000Z' WHERE id = ${original.id}`,
    );

    const actualizada = guardarMemoria(handle.db, { clave: "ciudad", contenido: "Granada" });

    expect(actualizada.id).toBe(original.id);
    expect(actualizada.clave).toBe("ciudad");
    expect(actualizada.contenido).toBe("Granada");
    expect(actualizada.actualizada).not.toBe("2020-01-01T00:00:00.000Z");
    expect(listarMemorias(handle.db)).toEqual([actualizada]);
  });

  it("crea memorias distintas para claves distintas", () => {
    const primera = guardarMemoria(handle.db, { clave: "zona", contenido: "sur" });
    const segunda = guardarMemoria(handle.db, { clave: "idioma", contenido: "es" });

    expect(primera.id).not.toBe(segunda.id);
    expect(listarMemorias(handle.db).map((memoria) => memoria.clave)).toEqual(["idioma", "zona"]);
  });

  it("rechaza una clave vacía", () => {
    expect(() => guardarMemoria(handle.db, { clave: "   ", contenido: "algo" })).toThrow(
      IndexError,
    );
  });

  it("rechaza un contenido vacío", () => {
    expect(() => guardarMemoria(handle.db, { clave: "nota", contenido: "  " })).toThrow(IndexError);
  });
});

describe("listarMemorias / obtenerMemoria", () => {
  it("lista las memorias por clave y devuelve undefined si no existe", () => {
    guardarMemoria(handle.db, { clave: "zeta", contenido: "última" });
    guardarMemoria(handle.db, { clave: "alfa", contenido: "primera" });

    expect(listarMemorias(handle.db).map((memoria) => memoria.clave)).toEqual(["alfa", "zeta"]);
    expect(obtenerMemoria(handle.db, MISSING_ID)).toBeUndefined();
  });
});

describe("actualizarMemoria", () => {
  it("actualiza el contenido y la fecha", () => {
    const original = guardarMemoria(handle.db, { clave: "comida", contenido: "pizza" });
    handle.db.run(
      sql`UPDATE memorias SET actualizada = '2020-01-01T00:00:00.000Z' WHERE id = ${original.id}`,
    );

    const actualizada = actualizarMemoria(handle.db, original.id, { contenido: "  pasta  " });

    expect(actualizada).toEqual({
      id: original.id,
      clave: "comida",
      contenido: "pasta",
      actualizada: expect.any(String),
    });
    expect(actualizada.actualizada).not.toBe("2020-01-01T00:00:00.000Z");
    expect(obtenerMemoria(handle.db, original.id)).toEqual(actualizada);
  });

  it("falla si la memoria no existe", () => {
    expect(() => actualizarMemoria(handle.db, MISSING_ID, { contenido: "algo" })).toThrow(
      IndexError,
    );
  });

  it("rechaza un contenido vacío", () => {
    const memoria = guardarMemoria(handle.db, { clave: "nota", contenido: "algo" });

    expect(() => actualizarMemoria(handle.db, memoria.id, { contenido: " " })).toThrow(IndexError);
  });
});

describe("borrarMemoria", () => {
  it("borra una memoria existente y devuelve true", () => {
    const memoria = guardarMemoria(handle.db, { clave: "temporal", contenido: "algo" });

    expect(borrarMemoria(handle.db, memoria.id)).toBe(true);
    expect(obtenerMemoria(handle.db, memoria.id)).toBeUndefined();
    expect(listarMemorias(handle.db)).toEqual([]);
  });

  it("devuelve false si la memoria no existe", () => {
    expect(borrarMemoria(handle.db, MISSING_ID)).toBe(false);
  });
});
