import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bootstrapVault,
  createObjectRepository,
  type DomainEvent,
  MAX_OBJECT_BYTES,
  type ObjectRepository,
} from "@migite/core";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyObjectEvent,
  buildIndex,
  createTitleCache,
  type IndexWarning,
  indexObject,
  reconcileIndex,
} from "./indexer.js";
import { type IndexHandle, openIndex } from "./open.js";
import { objetos } from "./schema.js";

const coreMocks = vi.hoisted(() => ({
  listObjectsCalls: 0,
  afterReadObject: undefined as ((ref: string) => void) | undefined,
}));

vi.mock("@migite/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@migite/core")>();
  return {
    ...actual,
    createObjectRepository: (
      options: Parameters<typeof actual.createObjectRepository>[0],
    ): ReturnType<typeof actual.createObjectRepository> => {
      const repository = actual.createObjectRepository(options);
      const listObjects = repository.listObjects;
      const readObject = repository.readObject;
      return {
        ...repository,
        listObjects: () => {
          coreMocks.listObjectsCalls += 1;
          return listObjects();
        },
        readObject: (ref: string) => {
          const result = readObject(ref);
          coreMocks.afterReadObject?.(ref);
          return result;
        },
      };
    },
  };
});

const CUSTOM_TYPE_YAML = `id: etiquetado
nombre: Etiquetado
descripcion: Objeto con atributos tipados
atributos:
  - id: etiquetas
    nombre: Etiquetas
    tipo: multi-seleccion
    obligatorio: false
    opciones: [uno, dos, tres]
  - id: puntuacion
    nombre: Puntuación
    tipo: numero
    obligatorio: false
  - id: activo
    nombre: Activo
    tipo: booleano
    obligatorio: false
  - id: vence
    nombre: Vence
    tipo: fecha
    obligatorio: false
  - id: pagina
    nombre: Página
    tipo: referencia
    obligatorio: false
  - id: web
    nombre: Web
    tipo: url
    obligatorio: false
`;

type ObjectRow = {
  id: string;
  tipo_id: string;
  titulo: string;
  ruta: string;
  hash: string;
  creado: string;
  actualizado: string;
};

type AttributeRow = {
  clave: string;
  valor_texto: string | null;
  valor_numero: number | null;
  valor_fecha: string | null;
};

type LinkRow = {
  origen_id: string;
  destino_id: string;
  contexto: string;
};

let directory: string;
let vaultDir: string;
let handle: IndexHandle;
let repo: ObjectRepository;

const dbPath = (): string => join(directory, "index.db");

const fileHash = (relativePath: string): string =>
  createHash("sha256")
    .update(readFileSync(join(vaultDir, relativePath), "utf8"))
    .digest("hex");

const objectRows = (): ObjectRow[] =>
  handle.db.all<ObjectRow>(
    sql`SELECT id, tipo_id, titulo, ruta, hash, creado, actualizado FROM objetos ORDER BY id`,
  );

const attributeTuples = (objetoId: string): unknown[][] =>
  handle.db
    .all<AttributeRow>(
      sql`SELECT clave, valor_texto, valor_numero, valor_fecha FROM atributos WHERE objeto_id = ${objetoId}`,
    )
    .map((row) => [row.clave, row.valor_texto, row.valor_numero, row.valor_fecha])
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

const linkRows = (): LinkRow[] =>
  handle.db
    .all<LinkRow>(sql`SELECT origen_id, destino_id, contexto FROM enlaces`)
    .sort((left, right) => left.contexto.localeCompare(right.contexto));

const ftsIds = (term: string): string[] =>
  handle.db
    .all<{ objeto_id: string }>(
      sql`SELECT objeto_id FROM fts_objetos WHERE fts_objetos MATCH ${term}`,
    )
    .map((row) => row.objeto_id)
    .sort();

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "migite-indexer-"));
  vaultDir = join(directory, "vault");
  bootstrapVault(vaultDir);
  writeFileSync(join(vaultDir, "tipos", "etiquetado.yaml"), CUSTOM_TYPE_YAML, "utf8");
  repo = createObjectRepository({ vaultDir, timeZone: "UTC" });
  handle = openIndex({ dbPath: dbPath() });
  coreMocks.afterReadObject = undefined;
});

afterEach(() => {
  handle.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("buildIndex", () => {
  it("projects objects, typed attributes and resolved links", () => {
    const destino = repo.createObject({ title: "Destino", type: "nota" });
    const documento = repo.createObject({
      title: "Documento enlazado",
      type: "etiquetado",
      body: "Hola [[Destino]] y [[No existe]]\n",
      links: ["[[Destino]]"],
      attributes: {
        etiquetas: ["uno", "dos"],
        puntuacion: 7.5,
        activo: true,
        vence: "2026-11-01",
        pagina: "[[Destino]]",
        web: "https://example.com/ruta",
        libre: 42,
        suelto: "texto",
      },
    });

    const count = buildIndex(handle.db, { vaultDir });

    expect(count).toBe(2);
    expect(
      objectRows()
        .map((row) => row.id)
        .sort(),
    ).toEqual([destino.id, documento.id].sort());
    expect(objectRows().find((row) => row.id === documento.id)).toMatchObject({
      tipo_id: "etiquetado",
      titulo: "Documento enlazado",
      ruta: documento.path,
      hash: fileHash(documento.path),
      creado: documento.created,
      actualizado: documento.updated,
    });
    expect(attributeTuples(documento.id)).toEqual(
      [
        ["activo", "true", null, null],
        ["etiquetas", "dos", null, null],
        ["etiquetas", "uno", null, null],
        ["libre", null, 42, null],
        ["pagina", "[[Destino]]", null, null],
        ["puntuacion", null, 7.5, null],
        ["suelto", "texto", null, null],
        ["vence", null, null, "2026-11-01"],
        ["web", "https://example.com/ruta", null, null],
      ].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    );
    expect(linkRows()).toEqual([
      { origen_id: documento.id, destino_id: destino.id, contexto: "cuerpo" },
      { origen_id: documento.id, destino_id: destino.id, contexto: "frontmatter" },
    ]);
    expect(ftsIds("hola")).toEqual([documento.id]);
    expect(ftsIds("documento")).toEqual([documento.id]);
    expect(ftsIds("example")).toEqual([documento.id]);
    expect(ftsIds("inexistente")).toEqual([]);
  });

  it("is idempotent across rebuilds", () => {
    repo.createObject({ title: "Destino", type: "nota" });
    repo.createObject({
      title: "Origen",
      type: "nota",
      body: "[[Destino]]",
      attributes: { peso: 1 },
    });
    buildIndex(handle.db, { vaultDir });
    const snapshot = (): unknown => ({
      objects: objectRows(),
      attributes: handle.db.all(
        sql`SELECT objeto_id, clave, valor_texto, valor_numero, valor_fecha FROM atributos ORDER BY objeto_id, clave, valor_texto`,
      ),
      links: handle.db.all(
        sql`SELECT origen_id, destino_id, contexto FROM enlaces ORDER BY origen_id`,
      ),
      fts: handle.db.all(
        sql`SELECT objeto_id, titulo, cuerpo, atributos FROM fts_objetos ORDER BY objeto_id`,
      ),
    });
    const before = snapshot();

    const count = buildIndex(handle.db, { vaultDir });

    expect(count).toBe(2);
    expect(snapshot()).toEqual(before);
  });

  it("skips unreadable files and projects degraded but parseable objects", () => {
    writeFileSync(join(vaultDir, "roto.md"), "---\ntitulo: Roto\n---\ncuerpo\n", "utf8");
    writeFileSync(
      join(vaultDir, "raro.md"),
      [
        "---",
        "id: 01J8XK2P4R5S6T7U8V9W0X1Y2Z",
        "titulo: Raro",
        "tipo: inexistente",
        "creado: 2026-10-05T14:00:00.000+02:00",
        "actualizado: 2026-10-05T14:00:00.000+02:00",
        "libre: 5",
        "---",
        "Cuerpo raro",
      ].join("\n"),
      "utf8",
    );

    const count = buildIndex(handle.db, { vaultDir });

    expect(count).toBe(1);
    expect(objectRows().map((row) => row.titulo)).toEqual(["Raro"]);
    expect(ftsIds("raro")).toEqual(["01J8XK2P4R5S6T7U8V9W0X1Y2Z"]);
    expect(attributeTuples("01J8XK2P4R5S6T7U8V9W0X1Y2Z")).toEqual([["libre", null, 5, null]]);
  });

  it("skips objects replaced by a symlink before the file re-read", () => {
    const externo = join(directory, "externo.md");
    writeFileSync(externo, "---\ntitulo: Externo\n---\ncontenido externo\n", "utf8");
    const seguro = repo.createObject({ title: "Seguro", type: "nota" });
    const enlazado = repo.createObject({ title: "Enlazado", type: "nota" });
    const warnings: IndexWarning[] = [];
    coreMocks.afterReadObject = (ref) => {
      if (ref === enlazado.id) {
        rmSync(join(vaultDir, enlazado.path));
        symlinkSync(externo, join(vaultDir, enlazado.path));
      }
    };

    const count = buildIndex(handle.db, {
      vaultDir,
      onWarning: (warning) => warnings.push(warning),
    });

    expect(count).toBe(1);
    expect(objectRows().map((row) => row.id)).toEqual([seguro.id]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe(enlazado.path);
    expect(warnings[0]?.problems.join(" ")).toContain("symbolic link");
  });

  it("skips files that grow past the read limit before the file re-read", () => {
    const seguro = repo.createObject({ title: "Seguro", type: "nota" });
    const grande = repo.createObject({ title: "Grande", type: "nota" });
    const warnings: IndexWarning[] = [];
    coreMocks.afterReadObject = (ref) => {
      if (ref === grande.id) {
        truncateSync(join(vaultDir, grande.path), MAX_OBJECT_BYTES + 1);
      }
    };

    const count = buildIndex(handle.db, {
      vaultDir,
      onWarning: (warning) => warnings.push(warning),
    });

    expect(count).toBe(1);
    expect(objectRows().map((row) => row.id)).toEqual([seguro.id]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe(grande.path);
    expect(warnings[0]?.problems.join(" ")).toContain("read limit");
  });

  it("deduplicates files that declare the same id", () => {
    const created = repo.createObject({
      title: "Duplicada",
      type: "nota",
      attributes: { peso: 2 },
    });
    writeFileSync(
      join(vaultDir, "copia.md"),
      readFileSync(join(vaultDir, created.path), "utf8"),
      "utf8",
    );

    const count = buildIndex(handle.db, { vaultDir });

    expect(count).toBe(1);
    expect(objectRows()).toHaveLength(1);
    expect(attributeTuples(created.id)).toEqual([["peso", null, 2, null]]);
    expect(ftsIds("duplicada")).toEqual([created.id]);
  });

  it("removes children through the objetos CASCADE", () => {
    repo.createObject({ title: "Destino", type: "nota" });
    const origen = repo.createObject({
      title: "Origen",
      type: "nota",
      body: "[[Destino]]",
      attributes: { peso: 1 },
    });
    buildIndex(handle.db, { vaultDir });

    handle.db.delete(objetos).where(eq(objetos.id, origen.id)).run();

    expect(attributeTuples(origen.id)).toEqual([]);
    expect(linkRows()).toEqual([]);
    expect(objectRows().map((row) => row.titulo)).toEqual(["Destino"]);
  });
});

describe("reconcileIndex", () => {
  it("projects links between objects created in the same batch", () => {
    const origen = repo.createObject({
      title: "Origen",
      type: "nota",
      body: "alfa [[Destino]]",
    });
    const destino = repo.createObject({ title: "Destino", type: "nota" });
    expect(origen.id.localeCompare(destino.id)).toBeLessThan(0);

    const summary = reconcileIndex(handle.db, { vaultDir });

    expect(summary).toEqual({ created: 2, updated: 0, deleted: 0 });
    expect(linkRows()).toEqual([
      { origen_id: origen.id, destino_id: destino.id, contexto: "cuerpo" },
    ]);
  });
});

describe("applyObjectEvent", () => {
  it("applies create, update, rename and delete events incrementally", () => {
    const destino = repo.createObject({ title: "Objetivo", type: "nota" });
    const destinoEvent: DomainEvent = {
      type: "ObjectCreated",
      objectId: destino.id,
      path: destino.path,
    };
    applyObjectEvent(handle.db, destinoEvent, { vaultDir });

    const origen = repo.createObject({ title: "Origen", type: "nota", body: "alfa [[Objetivo]]" });
    applyObjectEvent(
      handle.db,
      { type: "ObjectCreated", objectId: origen.id, path: origen.path },
      { vaultDir },
    );

    expect(objectRows()).toHaveLength(2);
    expect(linkRows()).toEqual([
      { origen_id: origen.id, destino_id: destino.id, contexto: "cuerpo" },
    ]);
    expect(ftsIds("alfa")).toEqual([origen.id]);

    repo.updateObject(origen.id, { body: "Sin referencias", attributes: { peso: 3 } });
    applyObjectEvent(
      handle.db,
      { type: "ObjectUpdated", objectId: origen.id, path: origen.path },
      { vaultDir },
    );

    expect(linkRows()).toEqual([]);
    expect(attributeTuples(origen.id)).toEqual([["peso", null, 3, null]]);
    expect(ftsIds("alfa")).toEqual([]);
    expect(ftsIds("sin")).toEqual([origen.id]);
    expect(ftsIds("referencias")).toEqual([origen.id]);

    const renamed = repo.renameObject(origen.id, "Origen renombrado");
    applyObjectEvent(
      handle.db,
      { type: "ObjectUpdated", objectId: origen.id, path: renamed.object.path },
      { vaultDir },
    );

    const renamedRow = objectRows().find((row) => row.id === origen.id);
    expect(renamedRow?.ruta).toBe(renamed.object.path);
    expect(renamedRow?.titulo).toBe("Origen renombrado");
    expect(renamedRow?.hash).toBe(fileHash(renamed.object.path));

    repo.deleteObject(origen.id);
    applyObjectEvent(
      handle.db,
      { type: "ObjectDeleted", objectId: origen.id, path: renamed.object.path },
      { vaultDir },
    );

    expect(objectRows().map((row) => row.id)).toEqual([destino.id]);
    expect(attributeTuples(origen.id)).toEqual([]);
    expect(linkRows()).toEqual([]);
    expect(ftsIds("sin")).toEqual([]);
  });

  it("keeps the index in sync when wired to repository events", () => {
    const observed = createObjectRepository({
      vaultDir,
      onEvent: (event) => applyObjectEvent(handle.db, event, { vaultDir }),
    });

    const created = observed.createObject({ title: "Sincronizada", type: "nota" });
    expect(objectRows().map((row) => row.id)).toEqual([created.id]);

    observed.updateObject(created.id, { body: "contenido cambiado" });
    expect(ftsIds("cambiado")).toEqual([created.id]);
    expect(ftsIds("sincronizada")).toEqual([created.id]);
    expect(ftsIds("sin")).toEqual([]);

    observed.deleteObject(created.id);
    expect(objectRows()).toEqual([]);
    expect(ftsIds("cambiado")).toEqual([]);
  });

  it("refreshes backlinks of linked objects when the target is renamed", () => {
    const observed = createObjectRepository({
      vaultDir,
      timeZone: "UTC",
      onEvent: (event) => applyObjectEvent(handle.db, event, { vaultDir }),
    });
    const destino = observed.createObject({ title: "Titulo viejo", type: "nota" });
    const origen = observed.createObject({
      title: "Fuente",
      type: "nota",
      body: "alfa [[Titulo viejo]]",
    });
    expect(ftsIds("viejo")).toEqual([destino.id, origen.id].sort());
    expect(linkRows()).toEqual([
      { origen_id: origen.id, destino_id: destino.id, contexto: "cuerpo" },
    ]);

    observed.renameObject(destino.id, "Titulo nuevo");

    expect(ftsIds("viejo")).toEqual([]);
    expect(ftsIds("nuevo")).toEqual([destino.id, origen.id].sort());
    expect(linkRows()).toEqual([
      { origen_id: origen.id, destino_id: destino.id, contexto: "cuerpo" },
    ]);
  });

  it("ignores events for objects that cannot be read", () => {
    applyObjectEvent(
      handle.db,
      { type: "ObjectCreated", objectId: "01J8XK2P4R5S6T7U8V9W0X1Y2Z", path: "perdido.md" },
      { vaultDir },
    );

    expect(objectRows()).toEqual([]);
  });

  it("scans the vault once across backlink updates and invalidates on create and delete", () => {
    const destino = repo.createObject({ title: "Destino", type: "nota" });
    const fuenteA = repo.createObject({ title: "Fuente 0", type: "nota", body: "[[Destino]]" });
    const fuenteB = repo.createObject({ title: "Fuente 1", type: "nota", body: "[[Destino]]" });
    const fuenteC = repo.createObject({ title: "Fuente 2", type: "nota", body: "[[Destino]]" });
    const fuentes = [fuenteA, fuenteB, fuenteC];
    buildIndex(handle.db, { vaultDir });

    coreMocks.listObjectsCalls = 0;
    const titleCache = createTitleCache(() => repo.listObjects());

    for (const fuente of fuentes) {
      applyObjectEvent(
        handle.db,
        { type: "ObjectUpdated", objectId: fuente.id, path: fuente.path },
        { vaultDir, titleCache },
      );
    }

    expect(coreMocks.listObjectsCalls).toBe(1);
    expect(
      linkRows()
        .map((row) => row.origen_id)
        .sort(),
    ).toEqual(fuentes.map((fuente) => fuente.id).sort());
    expect(linkRows().every((row) => row.destino_id === destino.id)).toBe(true);

    repo.deleteObject(destino.id);
    applyObjectEvent(
      handle.db,
      { type: "ObjectDeleted", objectId: destino.id, path: destino.path },
      { vaultDir, titleCache },
    );

    expect(coreMocks.listObjectsCalls).toBe(1);
    applyObjectEvent(
      handle.db,
      { type: "ObjectUpdated", objectId: fuenteA.id, path: fuenteA.path },
      { vaultDir, titleCache },
    );
    expect(coreMocks.listObjectsCalls).toBe(2);
    expect(linkRows()).toEqual([]);

    const recreado = repo.createObject({ title: "Destino", type: "nota" });
    applyObjectEvent(
      handle.db,
      { type: "ObjectCreated", objectId: recreado.id, path: recreado.path },
      { vaultDir, titleCache },
    );
    applyObjectEvent(
      handle.db,
      { type: "ObjectUpdated", objectId: fuenteA.id, path: fuenteA.path },
      { vaultDir, titleCache },
    );
    expect(coreMocks.listObjectsCalls).toBe(3);

    expect(linkRows()).toEqual([
      { origen_id: fuenteA.id, destino_id: recreado.id, contexto: "cuerpo" },
    ]);
  });

  it("invalidates cached titles when an update moves the object to a new path", () => {
    const destino = repo.createObject({ title: "Viejo", type: "nota" });
    const origen = repo.createObject({ title: "Fuente", type: "nota", body: "[[Viejo]]" });
    buildIndex(handle.db, { vaultDir });

    coreMocks.listObjectsCalls = 0;
    const titleCache = createTitleCache(() => repo.listObjects());
    applyObjectEvent(
      handle.db,
      { type: "ObjectUpdated", objectId: origen.id, path: origen.path },
      { vaultDir, titleCache },
    );
    expect(coreMocks.listObjectsCalls).toBe(1);

    const renamed = repo.renameObject(destino.id, "Nuevo");
    applyObjectEvent(
      handle.db,
      { type: "ObjectUpdated", objectId: destino.id, path: renamed.object.path },
      { vaultDir, titleCache },
    );
    applyObjectEvent(
      handle.db,
      { type: "ObjectUpdated", objectId: origen.id, path: origen.path },
      { vaultDir, titleCache },
    );

    expect(coreMocks.listObjectsCalls).toBe(2);
    expect(linkRows()).toEqual([
      { origen_id: origen.id, destino_id: destino.id, contexto: "cuerpo" },
    ]);
    expect(ftsIds("nuevo")).toEqual([destino.id, origen.id].sort());
  });
});

describe("indexObject", () => {
  it("projects a single object with its file text", () => {
    const created = repo.createObject({
      title: "Suelta",
      type: "nota",
      attributes: { peso: 2, etiqueta: "verde" },
    });
    const read = repo.readObject(created.id);
    if (!read.ok) {
      throw new Error("expected a readable object");
    }

    indexObject(handle.db, read.object, {
      fileText: readFileSync(join(vaultDir, created.path), "utf8"),
    });

    expect(objectRows().map((row) => row.id)).toEqual([created.id]);
    expect(objectRows()[0]?.hash).toBe(fileHash(created.path));
    expect(attributeTuples(created.id)).toEqual([
      ["etiqueta", "verde", null, null],
      ["peso", null, 2, null],
    ]);
    expect(ftsIds("suelta")).toEqual([created.id]);
  });

  it("falls back to the serialized object when no file text is given", () => {
    const created = repo.createObject({ title: "Respaldo", type: "nota" });
    const read = repo.readObject(created.id);
    if (!read.ok) {
      throw new Error("expected a readable object");
    }

    indexObject(handle.db, read.object);

    expect(objectRows()[0]?.hash).toBe(fileHash(created.path));
  });
});
