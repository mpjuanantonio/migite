import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapVault, createObjectRepository, loadTypeRegistry } from "@migite/core";
import {
  crearAccion,
  type IndexHandle,
  listarMemorias,
  obtenerAccion,
  openIndex,
} from "@migite/index";
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

describe("confirmarAccion con crear_tipo", () => {
  it("escribe el YAML del tipo y el registro lo carga al confirmar", () => {
    const accion = crearAccion(handle.db, {
      tipoAccion: "crear_tipo",
      payload: {
        id: "receta",
        nombre: "Receta",
        descripcion: "Recetas de cocina",
        atributos: [
          { id: "raciones", nombre: "Raciones", tipo: "numero", obligatorio: false },
          {
            id: "dificultad",
            nombre: "Dificultad",
            tipo: "seleccion",
            obligatorio: true,
            opciones: ["facil", "dificil"],
          },
        ],
        presentacion: { seccion: "notas", carpeta: "cocina" },
      },
    });

    const aplicada = confirmarAccion({ db: handle.db, vaultDir }, accion.id);

    expect(aplicada.estado).toBe("aplicada");
    expect(aplicada.resultado).toEqual({ id: "receta" });
    const path = join(vaultDir, "tipos", "receta.yaml");
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("nombre: Receta");
    const tipo = loadTypeRegistry(join(vaultDir, "tipos")).types.get("receta");
    expect(tipo?.name).toBe("Receta");
    expect(tipo?.description).toBe("Recetas de cocina");
    expect(tipo?.attributes.map((attribute) => attribute.id)).toEqual(["raciones", "dificultad"]);
    expect(tipo?.attributes[1]?.options).toEqual(["facil", "dificil"]);
    expect(tipo?.presentacion).toEqual({ seccion: "notas", carpeta: "cocina" });
  });

  it("deriva el id del nombre cuando la propuesta no lo trae", () => {
    const accion = crearAccion(handle.db, {
      tipoAccion: "crear_tipo",
      payload: { nombre: "Recetas de cocina", atributos: [] },
    });

    const aplicada = confirmarAccion({ db: handle.db, vaultDir }, accion.id);

    expect(aplicada.estado).toBe("aplicada");
    expect(aplicada.resultado).toEqual({ id: "recetas-de-cocina" });
    expect(existsSync(join(vaultDir, "tipos", "recetas-de-cocina.yaml"))).toBe(true);
  });

  it("marca la acción en error con detalle si el id es de un tipo nativo", () => {
    const accion = crearAccion(handle.db, {
      tipoAccion: "crear_tipo",
      payload: { id: "nota", nombre: "Nota ajena", atributos: [] },
    });

    expect(() => confirmarAccion({ db: handle.db, vaultDir }, accion.id)).toThrow();

    const registro = obtenerAccion(handle.db, accion.id);
    expect(registro?.estado).toBe("error");
    expect(registro?.detalle).toContain("nota");
    expect(registro?.detalle).toContain("nativo");
    expect(registro?.resultado).toBeUndefined();
  });

  it("marca la acción en error con detalle si la definición no es válida", () => {
    const accion = crearAccion(handle.db, {
      tipoAccion: "crear_tipo",
      payload: {
        id: "receta",
        nombre: "Receta",
        atributos: [
          {
            id: "raciones",
            nombre: "Raciones",
            tipo: "texto",
            obligatorio: false,
            opciones: ["a"],
          },
        ],
      },
    });

    expect(() => confirmarAccion({ db: handle.db, vaultDir }, accion.id)).toThrow();

    const registro = obtenerAccion(handle.db, accion.id);
    expect(registro?.estado).toBe("error");
    expect(registro?.detalle).toBe("Los datos proporcionados no son válidos");
    expect(existsSync(join(vaultDir, "tipos", "receta.yaml"))).toBe(false);
  });
});

describe("confirmarAccion con guardar_memoria", () => {
  it("guarda la memoria aprobada y devuelve su id como resultado", () => {
    const accion = crearAccion(handle.db, {
      tipoAccion: "guardar_memoria",
      payload: { clave: "color favorito", contenido: "azul" },
    });

    const aplicada = confirmarAccion({ db: handle.db, vaultDir }, accion.id);

    expect(aplicada.estado).toBe("aplicada");
    const [memoria] = listarMemorias(handle.db);
    expect(memoria).toBeDefined();
    expect(memoria?.clave).toBe("color favorito");
    expect(memoria?.contenido).toBe("azul");
    expect(aplicada.resultado).toEqual({ id: memoria?.id });
  });
});
