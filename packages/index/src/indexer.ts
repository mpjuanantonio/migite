import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AttributeDefinition,
  createObjectRepository,
  type DomainEvent,
  type FieldType,
  MAX_OBJECT_BYTES,
  normalizeTitle,
  ObjectOperationError,
  type ObjectRecord,
  parseWikiLinks,
  type ReadObjectResult,
  type TypeDefinition,
  writeObjectFile,
} from "@migite/core";
import type { RunResult } from "better-sqlite3";
import { eq, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { IndexDatabase } from "./open.js";
import type * as schemaTypes from "./schema.js";
import { atributos, enlaces, type LinkContext, objetos } from "./schema.js";

type ProjectionDatabase = BaseSQLiteDatabase<"sync", RunResult, typeof schemaTypes>;

export type IndexObjectOptions = {
  readonly fileText?: string;
  readonly definition?: TypeDefinition;
  readonly resolveTitle?: (title: string) => string | undefined;
};

export type IndexWarning = {
  readonly path: string;
  readonly problems: readonly string[];
};

export type IndexWarningHandler = (warning: IndexWarning) => void;

export type BuildIndexOptions = {
  readonly vaultDir: string;
  readonly timeZone?: string;
  readonly onWarning?: IndexWarningHandler;
};

export type ApplyObjectEventOptions = {
  readonly vaultDir: string;
  readonly timeZone?: string;
  readonly titleCache?: TitleCache;
  readonly onWarning?: IndexWarningHandler;
};

export type ReconcileOptions = {
  readonly vaultDir: string;
  readonly timeZone?: string;
  readonly onWarning?: IndexWarningHandler;
};

export type ReconcileSummary = {
  readonly created: number;
  readonly updated: number;
  readonly deleted: number;
};

export type ReindexOptions = BuildIndexOptions;

export type ReindexSummary = {
  readonly total: number;
};

type AttributeRow = {
  readonly clave: string;
  readonly valorTexto: string | null;
  readonly valorNumero: number | null;
  readonly valorFecha: string | null;
};

type TitledObject = {
  readonly id: string;
  readonly title: string;
};

export type TitleCache = {
  readonly resolve: (title: string) => string | undefined;
  readonly invalidate: () => void;
};

type ProjectionEntry = {
  readonly object: ObjectRecord;
  readonly definition: TypeDefinition | undefined;
  readonly fileText: string;
};

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

const asText = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? String(value) : encoded;
};

const valueTexts = (value: unknown): string[] => {
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    const items: unknown[] = value;
    return items.flatMap(valueTexts);
  }
  return [asText(value)];
};

const textRow = (clave: string, value: unknown): AttributeRow => ({
  clave,
  valorTexto: asText(value),
  valorNumero: null,
  valorFecha: null,
});

const numberRow = (clave: string, value: number): AttributeRow => ({
  clave,
  valorTexto: null,
  valorNumero: value,
  valorFecha: null,
});

const dateRow = (clave: string, value: string): AttributeRow => ({
  clave,
  valorTexto: null,
  valorNumero: null,
  valorFecha: value,
});

const singleRow = (
  clave: string,
  value: unknown,
  fieldType: FieldType | undefined,
): AttributeRow => {
  switch (fieldType) {
    case "number": {
      return typeof value === "number" && Number.isFinite(value)
        ? numberRow(clave, value)
        : textRow(clave, value);
    }
    case "date":
    case "datetime": {
      return typeof value === "string" ? dateRow(clave, value) : textRow(clave, value);
    }
    default: {
      if (fieldType === undefined && typeof value === "number" && Number.isFinite(value)) {
        return numberRow(clave, value);
      }
      return textRow(clave, value);
    }
  }
};

const attributeRows = (
  clave: string,
  value: unknown,
  definition: AttributeDefinition | undefined,
): AttributeRow[] => {
  if (value === undefined || value === null) {
    return [];
  }
  if (definition?.type === "multiSelect" || Array.isArray(value)) {
    const items: unknown[] = Array.isArray(value) ? value : [value];
    return items.map((item) => singleRow(clave, item, definition?.type));
  }
  return [singleRow(clave, value, definition?.type)];
};

const collectAttributeRows = (
  object: ObjectRecord,
  definition: TypeDefinition | undefined,
): AttributeRow[] => {
  const definitions = new Map<string, AttributeDefinition>(
    (definition?.attributes ?? []).map((attribute) => [attribute.id, attribute]),
  );
  const rows: AttributeRow[] = [];
  for (const [key, value] of Object.entries(object.attributes)) {
    rows.push(...attributeRows(key, value, definitions.get(key)));
  }
  return rows;
};

const attributeSearchText = (object: ObjectRecord): string =>
  Object.values(object.attributes).flatMap(valueTexts).join(", ");

const defaultObjectText = (object: ObjectRecord): string =>
  writeObjectFile(
    {
      id: object.id,
      type: object.type,
      title: object.title,
      created: object.created,
      updated: object.updated,
      links: [...object.links],
      attributes: object.attributes,
    },
    object.body,
  );

const defaultWarning: IndexWarningHandler = (warning) => {
  console.warn(`indexer: se omite "${warning.path}": ${warning.problems.join("; ")}`);
};

const reportWarning = (
  onWarning: IndexWarningHandler | undefined,
  path: string,
  problems: readonly string[],
): void => {
  (onWarning ?? defaultWarning)({ path, problems });
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const readObjectFile = (
  vaultDir: string,
  relativePath: string,
  onWarning: IndexWarningHandler | undefined,
): string | undefined => {
  const absolutePath = join(vaultDir, relativePath);
  let stats: ReturnType<typeof lstatSync>;
  try {
    stats = lstatSync(absolutePath);
  } catch (error) {
    reportWarning(onWarning, relativePath, [errorMessage(error)]);
    return undefined;
  }
  if (stats.isSymbolicLink()) {
    reportWarning(onWarning, relativePath, ["file is a symbolic link"]);
    return undefined;
  }
  if (!stats.isFile()) {
    reportWarning(onWarning, relativePath, ["file is not a regular file"]);
    return undefined;
  }
  if (stats.size > MAX_OBJECT_BYTES) {
    reportWarning(onWarning, relativePath, [
      `file exceeds the ${MAX_OBJECT_BYTES} byte read limit`,
    ]);
    return undefined;
  }
  try {
    return readFileSync(absolutePath, "utf8");
  } catch (error) {
    reportWarning(onWarning, relativePath, [errorMessage(error)]);
    return undefined;
  }
};

const createTitleResolver = (
  objects: readonly TitledObject[],
): ((title: string) => string | undefined) => {
  const byTitle = new Map<string, string>();
  const sorted = [...objects].sort((left, right) => left.id.localeCompare(right.id));
  for (const object of sorted) {
    const key = normalizeTitle(object.title);
    if (key !== "" && object.id !== "" && !byTitle.has(key)) {
      byTitle.set(key, object.id);
    }
  }
  return (title) => byTitle.get(normalizeTitle(title));
};

export const createTitleCache = (loadTitles: () => readonly TitledObject[]): TitleCache => {
  let resolveTitle: ((title: string) => string | undefined) | undefined;
  return {
    resolve: (title) => {
      resolveTitle ??= createTitleResolver(loadTitles());
      return resolveTitle(title);
    },
    invalidate: () => {
      resolveTitle = undefined;
    },
  };
};

const upsertObjectRow = (db: ProjectionDatabase, object: ObjectRecord, hash: string): void => {
  const values = {
    id: object.id,
    tipoId: object.type,
    titulo: object.title,
    ruta: object.path,
    hash,
    creado: object.created,
    actualizado: object.updated,
  };
  db.insert(objetos).values(values).onConflictDoUpdate({ target: objetos.id, set: values }).run();
};

const clearObjectRows = (db: ProjectionDatabase, objectId: string, fullRebuild: boolean): void => {
  if (fullRebuild) {
    return;
  }
  db.run(sql`DELETE FROM fts_objetos WHERE objeto_id = ${objectId}`);
  db.delete(atributos).where(eq(atributos.objetoId, objectId)).run();
  db.delete(enlaces).where(eq(enlaces.origenId, objectId)).run();
};

const projectAttributes = (
  db: ProjectionDatabase,
  object: ObjectRecord,
  definition: TypeDefinition | undefined,
): void => {
  const rows = collectAttributeRows(object, definition).map((row) => ({
    objetoId: object.id,
    clave: row.clave,
    valorTexto: row.valorTexto,
    valorNumero: row.valorNumero,
    valorFecha: row.valorFecha,
  }));
  if (rows.length > 0) {
    db.insert(atributos).values(rows).run();
  }
};

const projectLinks = (
  db: ProjectionDatabase,
  object: ObjectRecord,
  resolveTitle: ((title: string) => string | undefined) | undefined,
): void => {
  if (resolveTitle === undefined) {
    return;
  }
  const seen = new Set<string>();
  const project = (title: string, context: LinkContext): void => {
    const destinoId = resolveTitle(title);
    if (destinoId === undefined || destinoId === "") {
      return;
    }
    const indexed = db
      .select({ id: objetos.id })
      .from(objetos)
      .where(eq(objetos.id, destinoId))
      .get();
    if (indexed === undefined) {
      return;
    }
    const key = `${context}:${destinoId}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    db.insert(enlaces).values({ origenId: object.id, destinoId, contexto: context }).run();
  };
  for (const link of parseWikiLinks(object.body)) {
    project(link.title, "cuerpo");
  }
  for (const value of object.links) {
    for (const link of parseWikiLinks(value)) {
      project(link.title, "frontmatter");
    }
  }
};

const projectFts = (db: ProjectionDatabase, object: ObjectRecord, fullRebuild: boolean): void => {
  if (!fullRebuild) {
    db.run(sql`DELETE FROM fts_objetos WHERE objeto_id = ${object.id}`);
  }
  db.run(
    sql`INSERT INTO fts_objetos (objeto_id, titulo, cuerpo, atributos)
        VALUES (${object.id}, ${object.title}, ${object.body}, ${attributeSearchText(object)})`,
  );
};

const projectObject = (
  db: ProjectionDatabase,
  object: ObjectRecord,
  options: IndexObjectOptions,
  fullRebuild = false,
): void => {
  const fileText = options.fileText ?? defaultObjectText(object);
  clearObjectRows(db, object.id, fullRebuild);
  upsertObjectRow(db, object, sha256(fileText));
  projectAttributes(db, object, options.definition);
  projectLinks(db, object, options.resolveTitle);
  projectFts(db, object, fullRebuild);
};

export const indexObject = (
  db: IndexDatabase,
  object: ObjectRecord,
  options: IndexObjectOptions = {},
): void => {
  db.transaction((tx) => {
    projectObject(tx, object, options);
  });
};

const collectProjectionEntries = (
  vaultDir: string,
  timeZone: string | undefined,
  onWarning: IndexWarningHandler | undefined,
): ProjectionEntry[] => {
  const repository = createObjectRepository({ vaultDir, timeZone });
  const entries: ProjectionEntry[] = [];
  for (const summary of repository.listObjects()) {
    if (summary.id === "") {
      continue;
    }
    const read = repository.readObject(summary.id);
    if (!read.ok) {
      continue;
    }
    const fileText = readObjectFile(vaultDir, read.object.path, onWarning);
    if (fileText === undefined) {
      continue;
    }
    entries.push({
      object: read.object,
      definition: repository.getType(read.object.type),
      fileText,
    });
  }
  return entries;
};

const dedupeEntriesById = (entries: readonly ProjectionEntry[]): ProjectionEntry[] => {
  const byId = new Map<string, ProjectionEntry>();
  for (const entry of entries) {
    if (!byId.has(entry.object.id)) {
      byId.set(entry.object.id, entry);
    }
  }
  return [...byId.values()];
};

export const buildIndex = (db: IndexDatabase, options: BuildIndexOptions): number => {
  const entries = dedupeEntriesById(
    collectProjectionEntries(options.vaultDir, options.timeZone, options.onWarning),
  );
  const resolveTitle = createTitleResolver(entries.map((entry) => entry.object));
  db.transaction((tx) => {
    tx.run(sql`DELETE FROM fts_objetos`);
    tx.delete(enlaces).run();
    tx.delete(atributos).run();
    tx.delete(objetos).run();
    for (const entry of entries) {
      upsertObjectRow(tx, entry.object, sha256(entry.fileText));
    }
    for (const entry of entries) {
      projectObject(
        tx,
        entry.object,
        {
          fileText: entry.fileText,
          definition: entry.definition,
          resolveTitle,
        },
        true,
      );
    }
  });
  return entries.length;
};

export const runReindex = (db: IndexDatabase, options: ReindexOptions): ReindexSummary => ({
  total: buildIndex(db, options),
});

export const reconcileIndex = (db: IndexDatabase, options: ReconcileOptions): ReconcileSummary => {
  const entries = dedupeEntriesById(
    collectProjectionEntries(options.vaultDir, options.timeZone, options.onWarning),
  );
  const indexed = db
    .select({ id: objetos.id, ruta: objetos.ruta, hash: objetos.hash })
    .from(objetos)
    .all();
  const indexedById = new Map(indexed.map((row) => [row.id, row]));
  const byId = new Map(entries.map((entry) => [entry.object.id, entry]));
  const createdEntries: ProjectionEntry[] = [];
  const updatedEntries: ProjectionEntry[] = [];
  for (const entry of entries) {
    const row = indexedById.get(entry.object.id);
    if (row === undefined) {
      createdEntries.push(entry);
      continue;
    }
    if (row.hash !== sha256(entry.fileText) || row.ruta !== entry.object.path) {
      updatedEntries.push(entry);
    }
  }
  const deletedIds = indexed.filter((row) => !byId.has(row.id)).map((row) => row.id);
  const resolveTitle = createTitleResolver(entries.map((entry) => entry.object));
  const pendingEntries = [...createdEntries, ...updatedEntries];
  db.transaction((tx) => {
    for (const objectId of deletedIds) {
      tx.run(sql`DELETE FROM fts_objetos WHERE objeto_id = ${objectId}`);
      tx.delete(objetos).where(eq(objetos.id, objectId)).run();
    }
    for (const entry of pendingEntries) {
      upsertObjectRow(tx, entry.object, sha256(entry.fileText));
    }
    for (const entry of pendingEntries) {
      projectObject(tx, entry.object, {
        fileText: entry.fileText,
        definition: entry.definition,
        resolveTitle,
      });
    }
  });
  return {
    created: createdEntries.length,
    updated: updatedEntries.length,
    deleted: deletedIds.length,
  };
};

export const applyObjectEvent = (
  db: IndexDatabase,
  event: DomainEvent,
  options: ApplyObjectEventOptions,
): void => {
  if (event.type === "ObjectDeleted") {
    options.titleCache?.invalidate();
    const target =
      db.select({ id: objetos.id }).from(objetos).where(eq(objetos.id, event.objectId)).get() ??
      db.select({ id: objetos.id }).from(objetos).where(eq(objetos.ruta, event.path)).get();
    if (target === undefined) {
      return;
    }
    db.transaction((tx) => {
      tx.run(sql`DELETE FROM fts_objetos WHERE objeto_id = ${target.id}`);
      tx.delete(objetos).where(eq(objetos.id, target.id)).run();
    });
    return;
  }
  const repository = createObjectRepository({
    vaultDir: options.vaultDir,
    timeZone: options.timeZone,
  });
  const readRef = (ref: string): ReadObjectResult | undefined => {
    try {
      return repository.readObject(ref);
    } catch (error) {
      if (error instanceof ObjectOperationError) {
        return undefined;
      }
      throw error;
    }
  };
  const read =
    readRef(event.objectId) ?? (event.path === event.objectId ? undefined : readRef(event.path));
  if (read === undefined || !read.ok) {
    return;
  }
  const object = read.object;
  const fileText = readObjectFile(options.vaultDir, object.path, options.onWarning);
  if (fileText === undefined) {
    return;
  }
  if (options.titleCache !== undefined) {
    const previousPath = db
      .select({ ruta: objetos.ruta })
      .from(objetos)
      .where(eq(objetos.id, object.id))
      .get()?.ruta;
    if (previousPath === undefined || previousPath !== object.path) {
      options.titleCache.invalidate();
    }
  }
  const resolveTitle =
    options.titleCache === undefined
      ? createTitleResolver(repository.listObjects())
      : options.titleCache.resolve;
  const definition = repository.getType(object.type);
  db.transaction((tx) => {
    projectObject(tx, object, { fileText, definition, resolveTitle });
  });
};
