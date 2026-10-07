import { type SQL, sql } from "drizzle-orm";
import type { IndexDatabase } from "./open.js";

export type AttributeRangeFilter = {
  readonly clave: string;
  readonly desde?: string;
  readonly hasta?: string;
};

export type ObjectFilters = {
  readonly tipo?: string;
  readonly carpeta?: string;
  readonly tag?: string;
  readonly desde?: string;
  readonly hasta?: string;
  readonly atributos?: Readonly<Record<string, string | readonly string[]>>;
  readonly rangoAtributo?: AttributeRangeFilter | readonly AttributeRangeFilter[];
  readonly enlazadoA?: string;
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
  readonly offset?: number;
};

export type ListObjectsIndexedOptions = {
  readonly filters?: ObjectFilters;
  readonly limit?: number;
  readonly offset?: number;
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

const normalizeOffset = (offset: number | undefined): number =>
  offset === undefined || !Number.isSafeInteger(offset) || offset < 0 ? 0 : offset;

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

const attributeValueCondition = (value: string): SQL => {
  const branches: SQL[] = [sql`a.valor_texto = ${value}`];
  const numeric = Number(value);
  if (value.trim() !== "" && Number.isFinite(numeric)) {
    branches.push(sql`a.valor_numero = ${numeric}`);
  }
  branches.push(
    sql`(a.valor_fecha IS NOT NULL AND unixepoch(a.valor_fecha, 'subsec') = unixepoch(${value}, 'subsec'))`,
  );
  return sql.join(branches, sql` OR `);
};

const attributeConditions = (
  atributos: Readonly<Record<string, string | readonly string[]>>,
): SQL[] => {
  const conditions: SQL[] = [];
  for (const [clave, raw] of Object.entries(atributos)) {
    if (clave === "") {
      continue;
    }
    const values = (typeof raw === "string" ? [raw] : raw).filter((value) => value !== "");
    if (values.length === 0) {
      continue;
    }
    const matches = sql.join(values.map(attributeValueCondition), sql` OR `);
    conditions.push(sql`EXISTS (
      SELECT 1 FROM atributos a
      WHERE a.objeto_id = o.id AND a.clave = ${clave} AND (${matches})
    )`);
  }
  return conditions;
};

const rangeAttributeConditions = (
  rangoAtributo: AttributeRangeFilter | readonly AttributeRangeFilter[],
): SQL[] => {
  const ranges = "clave" in rangoAtributo ? [rangoAtributo] : rangoAtributo;
  const conditions: SQL[] = [];
  for (const range of ranges) {
    if (range.clave === "") {
      continue;
    }
    const bounds: SQL[] = [];
    if (range.desde !== undefined && range.desde !== "") {
      bounds.push(sql`unixepoch(a.valor_fecha, 'subsec') >= unixepoch(${range.desde}, 'subsec')`);
    }
    if (range.hasta !== undefined && range.hasta !== "") {
      bounds.push(sql`unixepoch(a.valor_fecha, 'subsec') <= unixepoch(${range.hasta}, 'subsec')`);
    }
    if (bounds.length === 0) {
      continue;
    }
    conditions.push(sql`EXISTS (
      SELECT 1 FROM atributos a
      WHERE a.objeto_id = o.id AND a.clave = ${range.clave} AND a.valor_fecha IS NOT NULL
        AND ${sql.join(bounds, sql` AND `)}
    )`);
  }
  return conditions;
};

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
  if (filters.atributos !== undefined) {
    conditions.push(...attributeConditions(filters.atributos));
  }
  if (filters.rangoAtributo !== undefined) {
    conditions.push(...rangeAttributeConditions(filters.rangoAtributo));
  }
  if (filters.enlazadoA !== undefined && filters.enlazadoA !== "") {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM enlaces e
      WHERE e.origen_id = o.id AND e.destino_id = ${filters.enlazadoA}
        AND e.contexto IN ('cuerpo', 'frontmatter')
    )`);
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
    OFFSET ${normalizeOffset(options.offset)}
  `);
  return byRecentUpdate(rows);
};

export const searchObjects = (
  db: IndexDatabase,
  options: SearchObjectsOptions = {},
): SearchResult[] => {
  if (options.query === undefined) {
    return listObjectsIndexed(db, options);
  }
  const conditions = filterConditions(options.filters);
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
    LIMIT ${normalizeLimit(options.limit, DEFAULT_SEARCH_LIMIT)}
    OFFSET ${normalizeOffset(options.offset)}
  `);
  return rows.map(toSearchResult);
};
