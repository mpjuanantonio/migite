import {
  type SearchParams,
  type SearchResultItem,
  searchResultItemSchema,
} from "@migite/contracts";
import {
  DEFAULT_SEARCH_LIMIT,
  type IndexDatabase,
  listObjectsIndexed,
  type SearchResult,
  searchObjects,
} from "@migite/index";
import { encodeCursor, filtersOf } from "./objetos.js";

export type BuscarDeps = {
  readonly db: IndexDatabase;
};

export type BuscarPage = {
  readonly resultados: SearchResultItem[];
  readonly siguienteCursor: string | null;
};

export const DEFAULT_BUSCAR_LIMIT = DEFAULT_SEARCH_LIMIT;

const toResultado = (row: SearchResult): SearchResultItem =>
  searchResultItemSchema.parse({
    id: row.id,
    tipo: row.tipo,
    titulo: row.titulo,
    ruta: row.ruta,
    actualizado: row.actualizado,
    ...(row.snippet === undefined ? {} : { fragmento: row.snippet }),
  });

export const buscar = (deps: BuscarDeps, params: SearchParams, offset: number): BuscarPage => {
  const limit = params.limite ?? DEFAULT_BUSCAR_LIMIT;
  const query = params.q?.trim() ?? "";
  const filters = filtersOf(params);
  const fetchLimit = limit + 1;
  const rows: SearchResult[] =
    query === ""
      ? listObjectsIndexed(deps.db, { filters, limit: fetchLimit, offset })
      : searchObjects(deps.db, { query, filters, limit: fetchLimit, offset });
  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  return {
    resultados: page.map(toResultado),
    siguienteCursor: hasMore ? encodeCursor(offset + page.length) : null,
  };
};
