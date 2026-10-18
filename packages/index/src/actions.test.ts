import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isUlid } from "@migite/core";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AccionConflictoError,
  actualizarEstadoAccion,
  crearAccion,
  listarAcciones,
  obtenerAccion,
} from "./actions.js";
import { IndexError, type IndexHandle, openIndex } from "./open.js";

const MISSING_ID = "01J00000000000000000000000";

let directory: string;
let handle: IndexHandle;

const create = (tipoAccion: string, payload: unknown): ReturnType<typeof crearAccion> =>
  crearAccion(handle.db, { tipoAccion, payload });

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "migite-acciones-"));
  handle = openIndex({ dbPath: join(directory, "index.db") });
});

afterEach(() => {
  handle.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("crearAccion", () => {
  it("stores a pending action with a ULID and an ISO timestamp", () => {
    const action = create("crear_objeto", { titulo: "Nota nueva", cuerpo: "hola" });

    expect(isUlid(action.id)).toBe(true);
    expect(action.estado).toBe("pendiente");
    expect(action.tipoAccion).toBe("crear_objeto");
    expect(action.payload).toEqual({ titulo: "Nota nueva", cuerpo: "hola" });
    expect(new Date(action.creada).toISOString()).toBe(action.creada);
  });

  it("trims the action type before storing it", () => {
    const action = create("  borrar_objeto  ", { id: "01JOBJETO000000000000000000" });

    expect(action.tipoAccion).toBe("borrar_objeto");
  });

  it("rejects an empty action type", () => {
    expect(() => create("   ", {})).toThrow(IndexError);
  });

  it("rejects a payload that cannot be serialized", () => {
    const circular: Record<string, unknown> = {};
    circular.yo = circular;

    expect(() => create("crear_objeto", circular)).toThrow(IndexError);
  });

  it("reuses an identical pending proposal instead of duplicating it", () => {
    const first = create("crear_objeto", { titulo: "Nota nueva", atributos: { z: 2, a: 1 } });
    const second = create("crear_objeto", { atributos: { a: 1, z: 2 }, titulo: "Nota nueva" });

    expect(second.id).toBe(first.id);
    expect(second.creada).toBe(first.creada);
    expect(listarAcciones(handle.db)).toEqual([first]);
  });

  it("creates a new proposal when the previous one is no longer pending", () => {
    const first = create("crear_objeto", { titulo: "Nota nueva" });
    actualizarEstadoAccion(handle.db, first.id, { estado: "rechazada" });

    const second = create("crear_objeto", { titulo: "Nota nueva" });

    expect(second.id).not.toBe(first.id);
    expect(listarAcciones(handle.db)).toHaveLength(2);
  });

  it("creates a new proposal when the type or the payload differs", () => {
    const first = create("crear_objeto", { titulo: "Nota nueva" });
    const otroPayload = create("crear_objeto", { titulo: "Otra nota" });
    const otroTipo = create("borrar_objeto", { titulo: "Nota nueva" });

    expect(new Set([first.id, otroPayload.id, otroTipo.id]).size).toBe(3);
  });
});

describe("listarAcciones / obtenerAccion", () => {
  it("lists actions newest first and filters by state", () => {
    const first = create("crear_objeto", { titulo: "Primera" });
    const second = create("editar_objeto", { id: "01JOBJETO000000000000000000", cambios: {} });
    const third = create("borrar_objeto", { id: "01JOBJETO000000000000000000" });
    actualizarEstadoAccion(handle.db, second.id, { estado: "rechazada" });

    const todas = listarAcciones(handle.db);
    expect(todas.map((action) => action.id)).toEqual([third.id, second.id, first.id]);
    expect(todas[1]).toEqual({
      id: second.id,
      tipoAccion: "editar_objeto",
      payload: { id: "01JOBJETO000000000000000000", cambios: {} },
      estado: "rechazada",
      creada: second.creada,
    });

    const rechazadas = listarAcciones(handle.db, { estado: "rechazada" });
    expect(rechazadas.map((action) => action.id)).toEqual([second.id]);
  });

  it("returns undefined for an unknown action", () => {
    expect(obtenerAccion(handle.db, MISSING_ID)).toBeUndefined();
  });

  it("rejects a state read from the database that is not known", () => {
    const action = create("crear_objeto", { titulo: "Nota" });
    handle.db.run(sql`UPDATE acciones SET estado = 'desconocido' WHERE id = ${action.id}`);

    expect(() => listarAcciones(handle.db)).toThrow(IndexError);
  });

  it("rejects a payload read from the database that is not valid JSON", () => {
    const action = create("crear_objeto", { titulo: "Nota" });
    handle.db.run(sql`UPDATE acciones SET payload = '{' WHERE id = ${action.id}`);

    expect(() => obtenerAccion(handle.db, action.id)).toThrow(IndexError);
  });
});

describe("actualizarEstadoAccion", () => {
  it("persists the state, the result and the detail", () => {
    const action = create("crear_objeto", { titulo: "Nota nueva" });

    const applied = actualizarEstadoAccion(handle.db, action.id, {
      estado: "aplicada",
      resultado: { id: "01JOBJETO000000000000000000" },
    });

    expect(applied).toEqual({
      ...action,
      estado: "aplicada",
      resultado: { id: "01JOBJETO000000000000000000" },
    });
    expect(obtenerAccion(handle.db, action.id)).toEqual(applied);

    const failed = create("borrar_objeto", { id: "01JOBJETO000000000000000000" });
    const withDetail = actualizarEstadoAccion(handle.db, failed.id, {
      estado: "error",
      detalle: "no se pudo aplicar",
    });

    expect(withDetail.estado).toBe("error");
    expect(withDetail.detalle).toBe("no se pudo aplicar");
    expect(withDetail.resultado).toBeUndefined();
  });

  it("clears the previous detail when a new state is applied", () => {
    const action = create("crear_objeto", { titulo: "Nota nueva" });
    actualizarEstadoAccion(handle.db, action.id, { estado: "error", detalle: "fallo" });

    const applied = actualizarEstadoAccion(handle.db, action.id, {
      estado: "aplicada",
      resultado: { id: "01JOBJETO000000000000000000" },
    });

    expect(applied.detalle).toBeUndefined();
  });

  it("throws when the action does not exist", () => {
    expect(() => actualizarEstadoAccion(handle.db, MISSING_ID, { estado: "aplicada" })).toThrow(
      IndexError,
    );
  });

  it("applies a transition only from the expected state", () => {
    const action = create("crear_objeto", { titulo: "Nota nueva" });

    const applied = actualizarEstadoAccion(handle.db, action.id, {
      estado: "aplicada",
      desde: "pendiente",
    });

    expect(applied.estado).toBe("aplicada");
    expect(() =>
      actualizarEstadoAccion(handle.db, action.id, { estado: "aplicada", desde: "pendiente" }),
    ).toThrow(AccionConflictoError);
    expect(obtenerAccion(handle.db, action.id)?.estado).toBe("aplicada");
  });

  it("reports the current state when the transition loses a race", () => {
    const action = create("crear_objeto", { titulo: "Nota nueva" });
    actualizarEstadoAccion(handle.db, action.id, { estado: "rechazada" });

    let conflicto: AccionConflictoError | undefined;
    try {
      actualizarEstadoAccion(handle.db, action.id, { estado: "aplicada", desde: "pendiente" });
    } catch (error) {
      if (error instanceof AccionConflictoError) {
        conflicto = error;
      } else {
        throw error;
      }
    }

    expect(conflicto?.esperado).toBe("pendiente");
    expect(conflicto?.estadoActual).toBe("rechazada");
    expect(obtenerAccion(handle.db, action.id)?.estado).toBe("rechazada");
  });

  it("rejects a result that cannot be serialized", () => {
    const action = create("crear_objeto", { titulo: "Nota nueva" });
    const circular: Record<string, unknown> = {};
    circular.yo = circular;

    expect(() =>
      actualizarEstadoAccion(handle.db, action.id, {
        estado: "aplicada",
        resultado: circular,
      }),
    ).toThrow(IndexError);
  });
});
