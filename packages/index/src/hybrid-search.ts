import { asc, eq, inArray, sql } from "drizzle-orm";
import {
  decodeEmbeddingVector,
  EMBEDDINGS_MODEL_META_KEY,
  type EmbeddingProvider,
  syncEmbeddings,
} from "./embeddings.js";
import type { IndexDatabase } from "./open.js";
import { fragmentos, meta } from "./schema.js";
import {
  DEFAULT_SEARCH_LIMIT,
  filterConditions,
  listObjectsIndexed,
  MAX_SEARCH_LIMIT,
  normalizeLimit,
  normalizeOffset,
  type ObjectFilters,
  queryTerms,
  type SearchObjectsOptions,
  type SearchResult,
  searchObjects,
  whereClause,
} from "./search.js";

export const DEFAULT_RRF_K = 60;
export const DEFAULT_CANDIDATE_MULTIPLIER = 4;

export type HybridSearchResult = SearchResult & {
  readonly fragmentoId?: string;
  readonly encabezado?: string | null;
  readonly score?: number;
};

export type SearchKnowledgeOptions = {
  readonly query: string;
  readonly filters?: ObjectFilters;
  readonly limit?: number;
  readonly offset?: number;
  readonly queryVector?: readonly number[];
  readonly model?: string;
  readonly rrfK?: number;
  readonly candidateMultiplier?: number;
};

export type SearchKnowledgeHybridOptions = SearchObjectsOptions & {
  readonly embeddingProvider?: EmbeddingProvider;
  readonly autoSyncEmbeddings?: boolean;
  readonly rrfK?: number;
  readonly candidateMultiplier?: number;
};

type FragmentRow = {
  readonly id: string;
  readonly objetoId: string;
  readonly encabezado: string | null;
  readonly texto: string;
  readonly orden: number;
};

type SemanticCandidateRow = {
  readonly id: string;
  readonly tipo_id: string;
  readonly titulo: string;
  readonly ruta: string;
  readonly actualizado: string;
  readonly fragmento_id: string;
  readonly encabezado: string | null;
  readonly texto: string;
  readonly orden: number;
  readonly vector: Buffer | Uint8Array;
};

type LexicalCandidate = {
  readonly result: SearchResult;
  readonly rank: number;
  readonly fragmentoId: string | undefined;
  readonly encabezado: string | null | undefined;
  readonly matchedTerms: number;
};

type SemanticCandidate = {
  readonly object: SearchResult;
  readonly rank: number;
  readonly fragmentoId: string;
  readonly encabezado: string | null;
  readonly snippet: string;
  readonly similarity: number;
};

export const cosineSimilarity = (
  left: Float32Array | readonly number[],
  right: Float32Array | readonly number[],
): number => {
  if (left.length === 0 || left.length !== right.length) {
    return 0;
  }
  let dot = 0;
  let normLeft = 0;
  let normRight = 0;
  for (let i = 0; i < left.length; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    dot += l * r;
    normLeft += l * l;
    normRight += r * r;
  }
  const denom = Math.sqrt(normLeft) * Math.sqrt(normRight);
  if (!Number.isFinite(denom) || denom <= 0) {
    return 0;
  }
  const sim = dot / denom;
  return Number.isFinite(sim) ? sim : 0;
};

const normalizeForMatch = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();

const scoreFragmentTerms = (fragment: FragmentRow, normalizedTerms: readonly string[]): number => {
  if (normalizedTerms.length === 0) {
    return 0;
  }
  const haystack = normalizeForMatch(`${fragment.encabezado ?? ""}\n${fragment.texto}`);
  let matches = 0;
  for (const term of normalizedTerms) {
    if (haystack.includes(term)) {
      matches += 1;
    }
  }
  return matches;
};

const selectBestFragment = (
  fragments: readonly FragmentRow[],
  normalizedTerms: readonly string[],
): { readonly fragment: FragmentRow | undefined; readonly matchedTerms: number } => {
  if (fragments.length === 0) {
    return { fragment: undefined, matchedTerms: 0 };
  }
  let best = fragments[0];
  let bestScore = best === undefined ? 0 : scoreFragmentTerms(best, normalizedTerms);
  for (let i = 1; i < fragments.length; i += 1) {
    const current = fragments[i];
    if (current === undefined) {
      continue;
    }
    const score = scoreFragmentTerms(current, normalizedTerms);
    if (score > bestScore) {
      best = current;
      bestScore = score;
    }
  }
  return { fragment: best, matchedTerms: bestScore };
};

const loadFragmentsByObjectIds = (
  db: IndexDatabase,
  objectIds: readonly string[],
): Map<string, FragmentRow[]> => {
  const byObject = new Map<string, FragmentRow[]>();
  if (objectIds.length === 0) {
    return byObject;
  }
  const rows = db
    .select({
      id: fragmentos.id,
      objetoId: fragmentos.objetoId,
      encabezado: fragmentos.encabezado,
      texto: fragmentos.texto,
      orden: fragmentos.orden,
    })
    .from(fragmentos)
    .where(inArray(fragmentos.objetoId, [...objectIds]))
    .orderBy(asc(fragmentos.objetoId), asc(fragmentos.orden), asc(fragmentos.id))
    .all();

  for (const row of rows) {
    const existing = byObject.get(row.objetoId);
    if (existing === undefined) {
      byObject.set(row.objetoId, [row]);
    } else {
      existing.push(row);
    }
  }
  return byObject;
};

const collectLexicalCandidates = (
  db: IndexDatabase,
  query: string,
  filters: ObjectFilters | undefined,
  limit: number,
  offset = 0,
): LexicalCandidate[] => {
  const results = searchObjects(db, { query, filters, limit, offset });
  if (results.length === 0) {
    return [];
  }
  const normalizedTerms = queryTerms(query).map(normalizeForMatch);
  const fragmentsByObject = loadFragmentsByObjectIds(
    db,
    results.map((r) => r.id),
  );
  return results.map((result, idx) => {
    const objectFragments = fragmentsByObject.get(result.id) ?? [];
    const { fragment, matchedTerms } = selectBestFragment(objectFragments, normalizedTerms);
    const snippet = result.snippet ?? fragment?.texto;
    return {
      result: snippet === undefined ? result : { ...result, snippet },
      rank: idx + 1,
      fragmentoId: fragment?.id,
      encabezado: fragment === undefined ? undefined : fragment.encabezado,
      matchedTerms,
    };
  });
};

const resolveActiveModel = (
  db: IndexDatabase,
  explicitModel: string | undefined,
): string | undefined => {
  if (explicitModel !== undefined && explicitModel.trim().length > 0) {
    return explicitModel.trim();
  }
  return db
    .select({ valor: meta.valor })
    .from(meta)
    .where(eq(meta.clave, EMBEDDINGS_MODEL_META_KEY))
    .get()?.valor;
};

const collectSemanticCandidates = (
  db: IndexDatabase,
  queryVector: readonly number[],
  filters: ObjectFilters | undefined,
  model: string | undefined,
  candidatePool: number,
): SemanticCandidate[] => {
  if (queryVector.length === 0) {
    return [];
  }
  const activeModel = resolveActiveModel(db, model);
  if (activeModel === undefined || activeModel === "") {
    return [];
  }
  const conditions = filterConditions(filters);
  const rows = db.all<SemanticCandidateRow>(sql`
    SELECT
      o.id,
      o.tipo_id,
      o.titulo,
      o.ruta,
      o.actualizado,
      f.id AS fragmento_id,
      f.encabezado AS encabezado,
      f.texto AS texto,
      f.orden AS orden,
      e.vector AS vector
    FROM fragmentos f
    JOIN embeddings e ON e.fragmento_id = f.id AND e.modelo = ${activeModel}
    JOIN objetos o ON o.id = f.objeto_id
    WHERE ${whereClause(conditions)}
  `);

  const bestByObject = new Map<
    string,
    {
      readonly row: SemanticCandidateRow;
      readonly similarity: number;
    }
  >();

  for (const row of rows) {
    let decoded: Float32Array;
    try {
      decoded = decodeEmbeddingVector(row.vector);
    } catch {
      continue;
    }
    const similarity = cosineSimilarity(queryVector, decoded);
    if (similarity <= 0) {
      continue;
    }
    const current = bestByObject.get(row.id);
    if (
      current === undefined ||
      similarity > current.similarity ||
      (similarity === current.similarity && row.orden < current.row.orden)
    ) {
      bestByObject.set(row.id, { row, similarity });
    }
  }

  const sorted = [...bestByObject.values()]
    .sort((left, right) => {
      if (right.similarity !== left.similarity) {
        return right.similarity - left.similarity;
      }
      return left.row.id.localeCompare(right.row.id);
    })
    .slice(0, candidatePool);

  return sorted.map(({ row, similarity }, idx) => ({
    object: {
      id: row.id,
      tipo: row.tipo_id,
      titulo: row.titulo,
      ruta: row.ruta,
      actualizado: row.actualizado,
      snippet: row.texto,
    },
    rank: idx + 1,
    fragmentoId: row.fragmento_id,
    encabezado: row.encabezado,
    snippet: row.texto,
    similarity,
  }));
};

export const searchKnowledge = (
  db: IndexDatabase,
  options: SearchKnowledgeOptions,
): HybridSearchResult[] => {
  const limit = normalizeLimit(options.limit, DEFAULT_SEARCH_LIMIT);
  const offset = normalizeOffset(options.offset);
  const rrfK =
    options.rrfK !== undefined && Number.isFinite(options.rrfK) && options.rrfK > 0
      ? options.rrfK
      : DEFAULT_RRF_K;
  const multiplier =
    options.candidateMultiplier !== undefined &&
    Number.isFinite(options.candidateMultiplier) &&
    options.candidateMultiplier >= 1
      ? Math.floor(options.candidateMultiplier)
      : DEFAULT_CANDIDATE_MULTIPLIER;

  const hasQueryVector = options.queryVector !== undefined && options.queryVector.length > 0;

  if (!hasQueryVector) {
    const lexicalOnly = collectLexicalCandidates(db, options.query, options.filters, limit, offset);
    return lexicalOnly.map((item) => ({
      ...item.result,
      ...(item.fragmentoId === undefined ? {} : { fragmentoId: item.fragmentoId }),
      ...(item.encabezado === undefined ? {} : { encabezado: item.encabezado }),
      score: 1 / (rrfK + offset + item.rank),
    }));
  }

  const candidatePool = Math.min(MAX_SEARCH_LIMIT, Math.max((limit + offset) * multiplier, 40));
  const lexicalList = collectLexicalCandidates(
    db,
    options.query,
    options.filters,
    candidatePool,
    0,
  );
  const semanticList = collectSemanticCandidates(
    db,
    options.queryVector ?? [],
    options.filters,
    options.model,
    candidatePool,
  );

  if (semanticList.length === 0) {
    return lexicalList.slice(offset, offset + limit).map((item) => ({
      ...item.result,
      ...(item.fragmentoId === undefined ? {} : { fragmentoId: item.fragmentoId }),
      ...(item.encabezado === undefined ? {} : { encabezado: item.encabezado }),
      score: 1 / (rrfK + item.rank),
    }));
  }

  const lexicalById = new Map(lexicalList.map((item) => [item.result.id, item]));
  const semanticById = new Map(semanticList.map((item) => [item.object.id, item]));
  const allIds = new Set<string>([...lexicalById.keys(), ...semanticById.keys()]);

  type FusedEntry = {
    readonly result: HybridSearchResult;
    readonly rrfScore: number;
    readonly semanticSimilarity: number;
    readonly lexicalRank: number;
  };

  const fused: FusedEntry[] = [];

  for (const id of allIds) {
    const lex = lexicalById.get(id);
    const sem = semanticById.get(id);
    const lexScore = lex === undefined ? 0 : 1 / (rrfK + lex.rank);
    const semScore = sem === undefined ? 0 : 1 / (rrfK + sem.rank);
    const rrfScore = lexScore + semScore;

    if (lex !== undefined && sem !== undefined) {
      const preferSemanticFragment = lex.matchedTerms === 0 || sem.rank < lex.rank;
      const fragmentoId = preferSemanticFragment
        ? sem.fragmentoId
        : (lex.fragmentoId ?? sem.fragmentoId);
      const encabezado = preferSemanticFragment
        ? sem.encabezado
        : lex.encabezado !== undefined
          ? lex.encabezado
          : sem.encabezado;
      const snippet =
        lex.matchedTerms > 0 && lex.result.snippet !== undefined ? lex.result.snippet : sem.snippet;

      fused.push({
        result: {
          ...lex.result,
          snippet,
          ...(fragmentoId === undefined ? {} : { fragmentoId }),
          ...(encabezado === undefined ? {} : { encabezado }),
          score: rrfScore,
        },
        rrfScore,
        semanticSimilarity: sem.similarity,
        lexicalRank: lex.rank,
      });
    } else if (lex !== undefined) {
      fused.push({
        result: {
          ...lex.result,
          ...(lex.fragmentoId === undefined ? {} : { fragmentoId: lex.fragmentoId }),
          ...(lex.encabezado === undefined ? {} : { encabezado: lex.encabezado }),
          score: rrfScore,
        },
        rrfScore,
        semanticSimilarity: 0,
        lexicalRank: lex.rank,
      });
    } else if (sem !== undefined) {
      fused.push({
        result: {
          ...sem.object,
          fragmentoId: sem.fragmentoId,
          encabezado: sem.encabezado,
          score: rrfScore,
        },
        rrfScore,
        semanticSimilarity: sem.similarity,
        lexicalRank: Number.POSITIVE_INFINITY,
      });
    }
  }

  fused.sort((left, right) => {
    if (right.rrfScore !== left.rrfScore) {
      return right.rrfScore - left.rrfScore;
    }
    if (right.semanticSimilarity !== left.semanticSimilarity) {
      return right.semanticSimilarity - left.semanticSimilarity;
    }
    if (left.lexicalRank !== right.lexicalRank) {
      return left.lexicalRank - right.lexicalRank;
    }
    return left.result.id.localeCompare(right.result.id);
  });

  return fused.slice(offset, offset + limit).map((entry) => entry.result);
};

export const searchHybridObjects = searchKnowledge;

export const searchKnowledgeHybrid = async (
  db: IndexDatabase,
  options: SearchKnowledgeHybridOptions = {},
): Promise<HybridSearchResult[]> => {
  if (options.query === undefined || options.query.trim() === "") {
    return listObjectsIndexed(db, options);
  }
  const query = options.query;
  if (options.embeddingProvider !== undefined) {
    try {
      if (options.autoSyncEmbeddings !== false) {
        await syncEmbeddings(db, options.embeddingProvider);
      }
      const vectors = await options.embeddingProvider.embed([query]);
      const queryVector = vectors[0];
      if (queryVector !== undefined && queryVector.length > 0) {
        return searchKnowledge(db, {
          query,
          ...(options.filters === undefined ? {} : { filters: options.filters }),
          ...(options.limit === undefined ? {} : { limit: options.limit }),
          ...(options.offset === undefined ? {} : { offset: options.offset }),
          ...(options.rrfK === undefined ? {} : { rrfK: options.rrfK }),
          ...(options.candidateMultiplier === undefined
            ? {}
            : { candidateMultiplier: options.candidateMultiplier }),
          queryVector,
          model: options.embeddingProvider.model,
        });
      }
    } catch {
      return searchKnowledge(db, {
        query,
        ...(options.filters === undefined ? {} : { filters: options.filters }),
        ...(options.limit === undefined ? {} : { limit: options.limit }),
        ...(options.offset === undefined ? {} : { offset: options.offset }),
        ...(options.rrfK === undefined ? {} : { rrfK: options.rrfK }),
        ...(options.candidateMultiplier === undefined
          ? {}
          : { candidateMultiplier: options.candidateMultiplier }),
      });
    }
  }

  return searchKnowledge(db, {
    query,
    ...(options.filters === undefined ? {} : { filters: options.filters }),
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    ...(options.offset === undefined ? {} : { offset: options.offset }),
    ...(options.rrfK === undefined ? {} : { rrfK: options.rrfK }),
    ...(options.candidateMultiplier === undefined
      ? {}
      : { candidateMultiplier: options.candidateMultiplier }),
  });
};
