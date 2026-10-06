import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bootstrapVault,
  createObjectRepository,
  type ObjectRecord,
  type ObjectRepository,
} from "@migite/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildIndex } from "./indexer.js";
import { type IndexHandle, openIndex } from "./open.js";
import { listObjectsIndexed, type SearchObjectsOptions, searchObjects } from "./search.js";

const CUSTOM_TYPE_YAML = `id: etiquetado
nombre: Etiquetado
descripcion: Objeto con etiquetas múltiples y puntuación
atributos:
  - id: etiquetas
    nombre: Etiquetas
    tipo: multi-seleccion
    obligatorio: false
    opciones: [rojo, verde, azul]
  - id: puntuacion
    nombre: Puntuación
    tipo: numero
    obligatorio: false
`;

type Fixtures = {
  readonly doc: ObjectRecord;
  readonly tarea: ObjectRecord;
  readonly rojo: ObjectRecord;
  readonly azul: ObjectRecord;
  readonly subrayado: ObjectRecord;
  readonly cruzada: ObjectRecord;
};

let directory: string;
let vaultDir: string;
let handle: IndexHandle;
let repo: ObjectRepository;
let fixtures: Fixtures;

const seed = (repository: ObjectRepository): Fixtures => {
  const doc = repository.createObject({
    title: "Documento de búsqueda",
    type: "nota",
    body: "guía completa sobre migración de datos",
    folder: "guias",
  });
  const tarea = repository.createObject({
    title: "Revisar búsqueda anual",
    type: "tarea",
    body: "revisar el índice",
    folder: "tareas",
    attributes: { estado: "pendiente" },
  });
  const rojo = repository.createObject({
    title: "Ficha roja",
    type: "etiquetado",
    body: "alfa beta",
    folder: "proyectos",
    attributes: { etiquetas: ["rojo", "verde"], puntuacion: 3 },
  });
  const azul = repository.createObject({
    title: "Ficha azul",
    type: "etiquetado",
    body: "alfa gamma delta",
    folder: "proyectos/sub",
    attributes: { etiquetas: ["azul"] },
  });
  const subrayado = repository.createObject({
    title: "Carpeta subrayada",
    type: "nota",
    folder: "a_b",
  });
  const cruzada = repository.createObject({
    title: "Carpeta cruzada",
    type: "nota",
    folder: "axb",
  });
  return { doc, tarea, rojo, azul, subrayado, cruzada };
};

const ids = (options: SearchObjectsOptions): string[] =>
  searchObjects(handle.db, options)
    .map((result) => result.id)
    .sort();

const listIds = (options: Parameters<typeof listObjectsIndexed>[1] = {}): string[] =>
  listObjectsIndexed(handle.db, options)
    .map((result) => result.id)
    .sort();

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "migite-search-"));
  vaultDir = join(directory, "vault");
  bootstrapVault(vaultDir);
  writeFileSync(join(vaultDir, "tipos", "etiquetado.yaml"), CUSTOM_TYPE_YAML, "utf8");
  repo = createObjectRepository({ vaultDir, timeZone: "UTC" });
  fixtures = seed(repo);
  handle = openIndex({ dbPath: join(directory, "index.db") });
  expect(buildIndex(handle.db, { vaultDir, timeZone: "UTC" })).toBe(6);
});

afterEach(() => {
  handle.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("searchObjects", () => {
  it("matches word prefixes and rejects inner substrings", () => {
    const expected = [fixtures.doc.id, fixtures.tarea.id].sort();

    expect(ids({ query: "busq" })).toEqual(expected);
    expect(ids({ query: "busqueda" })).toEqual(expected);
    expect(ids({ query: "búsqueda" })).toEqual(expected);
    expect(ids({ query: "bu" })).toEqual(expected);
    expect(ids({ query: "squeda" })).toEqual([]);
    expect(ids({ query: "usqueda" })).toEqual([]);
  });

  it("requires every whitespace separated term", () => {
    expect(ids({ query: "alfa beta" })).toEqual([fixtures.rojo.id]);
    expect(ids({ query: "beta alfa" })).toEqual([fixtures.rojo.id]);
    expect(ids({ query: "alfa gamma" })).toEqual([fixtures.azul.id]);
    expect(ids({ query: "alfa delta" })).toEqual([fixtures.azul.id]);
    expect(ids({ query: "alfa epsilon" })).toEqual([]);
  });

  it("treats quotes, operators and wildcards as literal text", () => {
    const bothAlfa = [fixtures.rojo.id, fixtures.azul.id].sort();

    expect(ids({ query: '"alfa"' })).toEqual(bothAlfa);
    expect(ids({ query: "^alfa" })).toEqual(bothAlfa);
    expect(ids({ query: "-alfa" })).toEqual(bothAlfa);
    expect(ids({ query: "alfa*" })).toEqual(bothAlfa);
    expect(ids({ query: 'alfa" OR "delta' })).toEqual([]);
    expect(ids({ query: "NEAR(alfa, beta)" })).toEqual([]);
    expect(ids({ query: "titulo:alfa" })).toEqual([]);
    expect(ids({ query: "***" })).toEqual([]);
    expect(ids({ query: "()" })).toEqual([]);
    expect(ids({ query: "   " })).toEqual([]);
  });

  it("returns grouped-friendly results with a snippet when searching", () => {
    const [result] = searchObjects(handle.db, { query: "migracion" });

    expect(result).toMatchObject({
      id: fixtures.doc.id,
      tipo: "nota",
      titulo: "Documento de búsqueda",
      ruta: fixtures.doc.path,
      actualizado: fixtures.doc.updated,
    });
    expect(result?.snippet).toContain("migración");
  });

  it("keeps a stable ranking across repeated calls", () => {
    const first = searchObjects(handle.db, { query: "busq" });

    expect(searchObjects(handle.db, { query: "busq" })).toEqual(first);
    expect(searchObjects(handle.db, { query: "busq" })).toEqual(first);
    expect(first.map((result) => result.id).sort()).toEqual(
      [fixtures.doc.id, fixtures.tarea.id].sort(),
    );
  });

  it("filters by type, folder, tag and updated range, alone or combined", () => {
    expect(listIds({ filters: { tipo: "etiquetado" } })).toEqual(
      [fixtures.rojo.id, fixtures.azul.id].sort(),
    );
    expect(listIds({ filters: { carpeta: "proyectos" } })).toEqual(
      [fixtures.rojo.id, fixtures.azul.id].sort(),
    );
    expect(listIds({ filters: { carpeta: "proyectos/sub" } })).toEqual([fixtures.azul.id]);
    expect(listIds({ filters: { tag: "verde" } })).toEqual([fixtures.rojo.id]);
    expect(listIds({ filters: { tag: "azul" } })).toEqual([fixtures.azul.id]);
    expect(listIds({ filters: { tag: "inexistente" } })).toEqual([]);

    const updated = fixtures.doc.updated;
    expect(listIds({ filters: { desde: updated } })).toContain(fixtures.doc.id);
    expect(listIds({ filters: { hasta: updated } })).toContain(fixtures.doc.id);
    expect(listIds({ filters: { desde: "9999-12-31T23:59:59.999Z" } })).toEqual([]);
    expect(listIds({ filters: { hasta: "0000-01-01T00:00:00.000Z" } })).toEqual([]);

    expect(ids({ query: "alfa", filters: { tag: "verde" } })).toEqual([fixtures.rojo.id]);
    expect(ids({ query: "alfa", filters: { tag: "azul" } })).toEqual([fixtures.azul.id]);
    expect(ids({ query: "alfa", filters: { tipo: "nota" } })).toEqual([]);
    expect(ids({ query: "busq", filters: { tipo: "tarea" } })).toEqual([fixtures.tarea.id]);
    expect(ids({ query: "busq", filters: { desde: updated } })).toContain(fixtures.doc.id);
  });

  it("escapes LIKE wildcards in the folder filter", () => {
    expect(listIds({ filters: { carpeta: "a_b" } })).toEqual([fixtures.subrayado.id]);
    expect(listIds({ filters: { carpeta: "a%b" } })).toEqual([]);
    expect(listIds({ filters: { carpeta: "a\\b" } })).toEqual([]);
  });

  it("lists by most recent update when there is no query", () => {
    const results = searchObjects(handle.db, {});
    const expected = [...results].sort((left, right) => {
      const byDate = right.actualizado.localeCompare(left.actualizado);
      return byDate !== 0 ? byDate : left.id.localeCompare(right.id);
    });

    expect(results).toEqual(expected);
    expect(results).toEqual(listObjectsIndexed(handle.db, {}));
    expect(results.every((result) => result.snippet === undefined)).toBe(true);
  });

  it("honours the limit", () => {
    expect(searchObjects(handle.db, { query: "a", limit: 2 })).toHaveLength(2);
    expect(searchObjects(handle.db, { limit: 1 })).toHaveLength(1);
  });
});

describe("listObjectsIndexed", () => {
  it("applies filters and a limit over the updated order", () => {
    const all = listObjectsIndexed(handle.db, {});
    const limited = listObjectsIndexed(handle.db, { limit: 2 });

    expect(all).toHaveLength(6);
    expect(limited.map((result) => result.id)).toEqual(all.slice(0, 2).map((result) => result.id));
    expect(listIds({ filters: { tipo: "etiquetado" } })).toEqual(
      [fixtures.rojo.id, fixtures.azul.id].sort(),
    );
    expect(listObjectsIndexed(handle.db, { limit: 0 })).toHaveLength(6);
  });
});
