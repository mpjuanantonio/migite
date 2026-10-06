import { type SQL, sql } from "drizzle-orm";
import type { IndexDatabase } from "./open.js";

export type ObjectFilters = {
  readonly tipo?: string;
  readonly carpeta?: string;
  readonly tag?: string;
  readonly desde?: string;
  readonly hasta?: string;
};

export type IndexedObject = {
  readonly id: string;
  readonly tipo: string;
  readonly titulo: string;
  readonly ruta: string;
  readonly actualizado: string;
};

export type SearchResult = IndexedObject & {
  readonly snippet?: string;
};

export type SearchObjectsOptions = {
  readonly query?: string;
  readonly filters?: ObjectFilters;
  readonly limit?: number;
};

export type ListObjectsIndexedOptions = {
  readonly filters?: ObjectFilters;
  readonly limit?: number;
};

export const DEFAULT_SEARCH_LIMIT = 100;

export const DEFAULT_LIST_LIMIT = 100;

export const MAX_SEARCH_LIMIT = 500;

export const TAGS_ATTRIBUTE_KEY = "etiquetas";

const MAX_QUERY_LENGTH = 512;

const MAX_QUERY_TERMS = 8;

type ObjectRow = {
  readonly id: string;
  readonly tipo_id: string;
  readonly titulo: string;
  readonly ruta: string;
  readonly actualizado: string;
};

type SearchRow = ObjectRow & {
  readonly snippet: string | null;
};

const NON_TERM_CHARS = /[^\p{L}\p{N}_]+/gu;

const normalizeLimit = (limit: number | undefined, fallback: number): number => {
  if (limit === undefined || !Number.isSafeInteger(limit) || limit <= 0) {
    return fallback;
  }
  return Math.min(limit, MAX_SEARCH_LIMIT);
};

const escapeLike = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");

const queryTerms = (query: string): string[] =>
  query
    .slice(0, MAX_QUERY_LENGTH)
    .normalize("NFKC")
    .split(NON_TERM_CHARS)
    .filter((term) => term.length > 0)
    .slice(0, MAX_QUERY_TERMS);

const matchExpression = (terms: readonly string[]): string =>
  terms.map((term) => `"${term.replaceAll('"', '""')}"*`).join(" ");

const filterConditions = (filters: ObjectFilters | undefined): SQL[] => {
  if (filters === undefined) {
    return [];
  }
  const conditions: SQL[] = [];
  if (filters.tipo !== undefined && filters.tipo !== "") {
    conditions.push(sql`o.tipo_id = ${filters.tipo}`);
  }
  if (filters.carpeta !== undefined && filters.carpeta !== "") {
    conditions.push(sql`o.ruta LIKE ${`${escapeLike(filters.carpeta)}%`} ESCAPE '\\'`);
  }
  if (filters.tag !== undefined && filters.tag !== "") {
    conditions.push(
      sql`o.id IN (SELECT a.objeto_id FROM atributos a WHERE a.clave = ${TAGS_ATTRIBUTE_KEY} AND a.valor_texto = ${filters.tag})`,
    );
  }
  if (filters.desde !== undefined && filters.desde !== "") {
    conditions.push(
      sql`unixepoch(o.actualizado, 'subsec') >= unixepoch(${filters.desde}, 'subsec')`,
    );
  }
  if (filters.hasta !== undefined && filters.hasta !== "") {
    conditions.push(
      sql`unixepoch(o.actualizado, 'subsec') <= unixepoch(${filters.hasta}, 'subsec')`,
    );
  }
  return conditions;
};

const whereClause = (conditions: SQL[]): SQL =>
  conditions.length === 0 ? sql`1 = 1` : sql.join(conditions, sql` AND `);

const OBJECT_COLUMNS = sql`o.id, o.tipo_id, o.titulo, o.ruta, o.actualizado`;

const toIndexedObject = (row: ObjectRow): IndexedObject => ({
  id: row.id,
  tipo: row.tipo_id,
  titulo: row.titulo,
  ruta: row.ruta,
  actualizado: row.actualizado,
});

const toSearchResult = (row: SearchRow): SearchResult => {
  const result = toIndexedObject(row);
  return row.snippet === null || row.snippet === "" ? result : { ...result, snippet: row.snippet };
};

const byRecentUpdate = (rows: readonly ObjectRow[]): IndexedObject[] => rows.map(toIndexedObject);

export const listObjectsIndexed = (
  db: IndexDatabase,
  options: ListObjectsIndexedOptions = {},
): IndexedObject[] => {
  const rows = db.all<ObjectRow>(sql`
    SELECT ${OBJECT_COLUMNS}
    FROM objetos o
    WHERE ${whereClause(filterConditions(options.filters))}
    ORDER BY o.actualizado DESC, o.id ASC
    LIMIT ${normalizeLimit(options.limit, DEFAULT_LIST_LIMIT)}
  `);
  return byRecentUpdate(rows);
};

export const searchObjects = (
  db: IndexDatabase,
  options: SearchObjectsOptions = {},
): SearchResult[] => {
  const conditions = filterConditions(options.filters);
  const limit = normalizeLimit(options.limit, DEFAULT_SEARCH_LIMIT);
  if (options.query === undefined) {
    const rows = db.all<ObjectRow>(sql`
      SELECT ${OBJECT_COLUMNS}
      FROM objetos o
      WHERE ${whereClause(conditions)}
      ORDER BY o.actualizado DESC, o.id ASC
      LIMIT ${limit}
    `);
    return byRecentUpdate(rows);
  }
  const terms = queryTerms(options.query);
  if (terms.length === 0) {
    return [];
  }
  const rows = db.all<SearchRow>(sql`
    SELECT ${OBJECT_COLUMNS}, snippet(fts_objetos, -1, '', '', '…', 12) AS snippet
    FROM fts_objetos
    JOIN objetos o ON o.id = fts_objetos.objeto_id
    WHERE fts_objetos MATCH ${matchExpression(terms)}
      AND ${whereClause(conditions)}
    ORDER BY rank, o.id ASC
    LIMIT ${limit}
  `);
  return rows.map(toSearchResult);
};
