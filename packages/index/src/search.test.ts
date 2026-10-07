import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bootstrapVault,
  createObjectRepository,
  type ObjectRecord,
  type ObjectRepository,
} from "@migite/core";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildIndex, indexObject } from "./indexer.js";
import { type IndexHandle, openIndex } from "./open.js";
import {
  DEFAULT_LIST_LIMIT,
  listObjectsIndexed,
  MAX_SEARCH_LIMIT,
  type SearchObjectsOptions,
  searchObjects,
} from "./search.js";

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

const pinUpdated = (id: string, actualizado: string): void => {
  handle.db.run(sql`UPDATE objetos SET actualizado = ${actualizado} WHERE id = ${id}`);
};

const insertBulkObjects = (count: number): void => {
  for (let index = 0; index < count; index += 1) {
    const suffix = String(index).padStart(4, "0");
    const id = `bulk-${suffix}`;
    handle.db.run(sql`
      INSERT INTO objetos (id, tipo_id, titulo, ruta, hash, creado, actualizado)
      VALUES (${id}, 'nota', ${`Nota ${suffix}`}, ${`bulk/${suffix}.md`}, 'hash', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `);
    handle.db.run(sql`
      INSERT INTO fts_objetos (titulo, cuerpo, atributos, objeto_id)
      VALUES (${`Nota ${suffix}`}, 'contenido masivo de paginacion', '', ${id})
    `);
  }
};

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

  it("compares updated bounds as UTC instants across offsets", () => {
    const instant = "2026-03-29T01:30:00.000Z";
    const before = "2026-03-29T01:29:59.999Z";
    const after = "2026-03-29T01:30:00.001Z";
    pinUpdated(fixtures.doc.id, "2026-03-29T03:30:00.000+02:00");
    pinUpdated(fixtures.tarea.id, "2026-03-29T02:30:00.000+01:00");
    pinUpdated(fixtures.rojo.id, instant);
    pinUpdated(fixtures.azul.id, "2026-03-28T23:30:00.000-02:00");
    pinUpdated(fixtures.subrayado.id, after);
    pinUpdated(fixtures.cruzada.id, before);

    const sameInstant = [
      fixtures.doc.id,
      fixtures.tarea.id,
      fixtures.rojo.id,
      fixtures.azul.id,
    ].sort();

    expect(listIds({ filters: { desde: instant, hasta: instant } })).toEqual(sameInstant);
    expect(
      listIds({
        filters: {
          desde: "2026-03-29T03:30:00.000+02:00",
          hasta: "2026-03-29T02:30:00.000+01:00",
        },
      }),
    ).toEqual(sameInstant);
    expect(listIds({ filters: { desde: after } })).toEqual([fixtures.subrayado.id]);
    expect(listIds({ filters: { hasta: before } })).toEqual([fixtures.cruzada.id]);
  });

  it("distinguishes repeated wall times at the DST fall-back", () => {
    pinUpdated(fixtures.rojo.id, "2026-10-25T02:30:00.000+02:00");
    pinUpdated(fixtures.azul.id, "2026-10-25T02:30:00.000+01:00");

    expect(
      listIds({
        filters: {
          tipo: "etiquetado",
          desde: "2026-10-25T02:30:00.000+01:00",
          hasta: "2026-10-25T02:30:00.000+01:00",
        },
      }),
    ).toEqual([fixtures.azul.id]);
    expect(
      listIds({
        filters: {
          tipo: "etiquetado",
          desde: "2026-10-25T02:30:00.000+02:00",
          hasta: "2026-10-25T02:30:00.000+02:00",
        },
      }),
    ).toEqual([fixtures.rojo.id]);
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

  it("truncates the query to 512 characters", () => {
    expect(ids({ query: `alfa${" ".repeat(600)}beta` })).toEqual(
      [fixtures.rojo.id, fixtures.azul.id].sort(),
    );
    expect(ids({ query: "x".repeat(600) })).toEqual([]);
    expect(ids({ query: " ".repeat(600) })).toEqual([]);
  });

  it("requires at most the first eight terms", () => {
    const terms = ["uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho"];
    const object = repo.createObject({
      title: "Nota de ocho términos",
      type: "nota",
      body: terms.join(" "),
      folder: "limites",
    });
    indexObject(handle.db, object);

    expect(ids({ query: [...terms, "nueve"].join(" ") })).toEqual([object.id]);
    expect(ids({ query: "ocho nueve" })).toEqual([]);
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

  it("clamps huge limits and falls back on invalid ones", () => {
    insertBulkObjects(600);

    expect(listObjectsIndexed(handle.db, { limit: 10_000 })).toHaveLength(MAX_SEARCH_LIMIT);
    expect(listObjectsIndexed(handle.db, { limit: Number.MAX_SAFE_INTEGER })).toHaveLength(
      MAX_SEARCH_LIMIT,
    );
    expect(listObjectsIndexed(handle.db, { limit: Number.NaN })).toHaveLength(DEFAULT_LIST_LIMIT);
    expect(listObjectsIndexed(handle.db, { limit: 1.5 })).toHaveLength(DEFAULT_LIST_LIMIT);
    expect(listObjectsIndexed(handle.db, { limit: -5 })).toHaveLength(DEFAULT_LIST_LIMIT);
    expect(searchObjects(handle.db, { limit: Number.MAX_SAFE_INTEGER })).toHaveLength(
      MAX_SEARCH_LIMIT,
    );
  });
});

describe("paginación con offset", () => {
  it("recorre tres páginas sin duplicados ni pérdidas", () => {
    const expectedList = listObjectsIndexed(handle.db, {
      limit: MAX_SEARCH_LIMIT,
    }).map((result) => result.id);
    expect(expectedList).toHaveLength(6);

    const listPages = [0, 2, 4].map((offset) =>
      listObjectsIndexed(handle.db, { limit: 2, offset }).map((result) => result.id),
    );
    expect(listPages.map((page) => page.length)).toEqual([2, 2, 2]);
    expect(listPages.flat()).toEqual(expectedList);
    expect(new Set(listPages.flat()).size).toBe(expectedList.length);
    expect(listObjectsIndexed(handle.db, { limit: 2, offset: 6 })).toEqual([]);

    const extra = [1, 2, 3].map((index) =>
      repo.createObject({
        title: `Objetivo ${index}`,
        type: "nota",
        body: "objetivo común",
        folder: "objetivos",
      }),
    );
    for (const object of extra) {
      indexObject(handle.db, object);
    }

    const expectedSearch = searchObjects(handle.db, { query: "objetivo" }).map(
      (result) => result.id,
    );
    expect(expectedSearch).toHaveLength(3);

    const searchPages = [0, 1, 2].map((offset) =>
      searchObjects(handle.db, { query: "objetivo", limit: 1, offset }).map((result) => result.id),
    );
    expect(searchPages.map((page) => page.length)).toEqual([1, 1, 1]);
    expect(searchPages.flat()).toEqual(expectedSearch);
    expect(new Set(searchPages.flat()).size).toBe(expectedSearch.length);
    expect(ids({ query: "objetivo", offset: 3 })).toEqual([]);
  });

  it("falls back to zero on invalid offsets and accepts huge ones", () => {
    const first = listObjectsIndexed(handle.db, { limit: 2 }).map((result) => result.id);

    for (const offset of [-1, 1.5, Number.NaN]) {
      expect(
        listObjectsIndexed(handle.db, { limit: 2, offset }).map((result) => result.id),
      ).toEqual(first);
      expect(searchObjects(handle.db, { limit: 2, offset }).map((result) => result.id)).toEqual(
        first,
      );
    }
    expect(listObjectsIndexed(handle.db, { limit: 2, offset: Number.MAX_SAFE_INTEGER })).toEqual(
      [],
    );
  });

  it("pages beyond the 500 result cap through list and search", () => {
    insertBulkObjects(1200);
    const total = 1206;

    const expected = [
      ...listObjectsIndexed(handle.db, { limit: MAX_SEARCH_LIMIT }),
      ...listObjectsIndexed(handle.db, { limit: MAX_SEARCH_LIMIT, offset: MAX_SEARCH_LIMIT }),
      ...listObjectsIndexed(handle.db, {
        limit: MAX_SEARCH_LIMIT,
        offset: MAX_SEARCH_LIMIT * 2,
      }),
    ].map((result) => result.id);
    expect(expected).toHaveLength(total);

    const listed: string[] = [];
    for (let offset = 0; offset < total; offset += 100) {
      const page = listObjectsIndexed(handle.db, { limit: 100, offset });
      expect(page).toHaveLength(Math.min(100, total - offset));
      listed.push(...page.map((result) => result.id));
    }
    expect(listed).toEqual(expected);
    expect(new Set(listed).size).toBe(total);

    const found: string[] = [];
    for (let offset = 0; offset < 1200; offset += 100) {
      const page = searchObjects(handle.db, { query: "masiv", limit: 100, offset });
      expect(page).toHaveLength(100);
      found.push(...page.map((result) => result.id));
    }
    expect(new Set(found).size).toBe(1200);
    expect(searchObjects(handle.db, { query: "masiv", offset: 1200 })).toEqual([]);
  });
});
