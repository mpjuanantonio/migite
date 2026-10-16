import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapVault, createObjectRepository } from "@migite/core";
import { crearAccion, type IndexHandle, openIndex } from "@migite/index";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmarAccion } from "./acciones.js";

let root: string;
let vaultDir: string;
let handle: IndexHandle;

const repositorio = () => createObjectRepository({ vaultDir });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "migite-acciones-servicio-"));
  vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  bootstrapVault(vaultDir);
  handle = openIndex({ dbPath: join(root, "index.db") });
});

afterEach(() => {
  handle.close();
  rmSync(root, { recursive: true, force: true });
});

describe("confirmarAccion con editar_objeto", () => {
  it("renombra el objeto cuando la propuesta cambia el título", () => {
    const objeto = repositorio().createObject({ title: "Viejo", body: "cuerpo original" });
    const accion = crearAccion(handle.db, {
      tipoAccion: "editar_objeto",
      payload: { id: objeto.id, cambios: { titulo: "Nuevo" } },
    });

    const aplicada = confirmarAccion({ db: handle.db, vaultDir }, accion.id);

    expect(aplicada.estado).toBe("aplicada");
    expect(aplicada.resultado).toEqual({ id: objeto.id });
    const renombrado = repositorio().readObject(objeto.id);
    expect(renombrado.ok).toBe(true);
    if (renombrado.ok) {
      expect(renombrado.object.title).toBe("Nuevo");
      expect(renombrado.object.path).not.toBe(objeto.path);
      expect(renombrado.object.body).toBe("cuerpo original");
    }
  });

  it("renombra y aplica el resto de cambios de la propuesta", () => {
    const objeto = repositorio().createObject({
      title: "Viejo",
      body: "original",
      attributes: { etiquetas: ["a"] },
    });
    const accion = crearAccion(handle.db, {
      tipoAccion: "editar_objeto",
      payload: {
        id: objeto.id,
        cambios: {
          titulo: "Nuevo título",
          cuerpo: "actualizado",
          carpeta: "archivo",
          atributos: { etiquetas: ["b"] },
        },
      },
    });

    const aplicada = confirmarAccion({ db: handle.db, vaultDir }, accion.id);

    expect(aplicada.estado).toBe("aplicada");
    const editado = repositorio().readObject(objeto.id);
    expect(editado.ok).toBe(true);
    if (editado.ok) {
      expect(editado.object.title).toBe("Nuevo título");
      expect(editado.object.folder).toBe("archivo");
      expect(editado.object.body).toBe("actualizado");
      expect(editado.object.attributes.etiquetas).toEqual(["b"]);
    }
  });

  it("sigue aplicando una edición sin título y sin cambios de contenido", () => {
    const objeto = repositorio().createObject({ title: "Viejo", body: "original" });
    const accion = crearAccion(handle.db, {
      tipoAccion: "editar_objeto",
      payload: { id: objeto.id, cambios: { carpeta: "archivo" } },
    });

    const aplicada = confirmarAccion({ db: handle.db, vaultDir }, accion.id);

    expect(aplicada.estado).toBe("aplicada");
    const movido = repositorio().readObject(objeto.id);
    expect(movido.ok).toBe(true);
    if (movido.ok) {
      expect(movido.object.title).toBe("Viejo");
      expect(movido.object.folder).toBe("archivo");
    }
  });
});
