import { and, asc, eq, ne, sql } from "drizzle-orm";
import { type IndexDatabase, IndexError } from "./open.js";
import { embeddings, fragmentos, meta } from "./schema.js";

export const EMBEDDINGS_MODEL_META_KEY = "embeddings_model";
export const DEFAULT_EMBED_BATCH_SIZE = 32;

export type EmbeddingProvider = {
  readonly model: string;
  readonly embed: (texts: readonly string[]) => Promise<readonly (readonly number[])[]>;
};

export type SyncEmbeddingsOptions = {
  readonly objetoId?: string;
  readonly batchSize?: number;
};

export type SyncEmbeddingsResult = {
  readonly model: string;
  readonly embedded: number;
  readonly PurgedOrModelChanged: boolean;
};

export const encodeEmbeddingVector = (vector: readonly number[]): Buffer => {
  const f32 = Float32Array.from(vector);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
};

export const decodeEmbeddingVector = (blob: Buffer | Uint8Array): Float32Array => {
  if (blob.byteLength % 4 !== 0) {
    throw new IndexError(
      `El blob de embedding tiene un tamaño inválido (${blob.byteLength} bytes); debe ser múltiplo de 4.`,
    );
  }
  if (blob.byteOffset % 4 === 0) {
    return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
  }
  const copy = new Uint8Array(blob.byteLength);
  copy.set(new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength));
  return new Float32Array(copy.buffer, 0, copy.byteLength / 4);
};

export const formatFragmentForEmbedding = (encabezado: string | null, texto: string): string =>
  encabezado !== null && encabezado.trim().length > 0 ? `${encabezado.trim()}\n\n${texto}` : texto;

const validateVectors = (
  vectors: readonly (readonly number[])[],
  expectedCount: number,
  model: string,
): void => {
  if (vectors.length !== expectedCount) {
    throw new IndexError(
      `El proveedor de embeddings "${model}" devolvió ${vectors.length} vectores para un lote de ${expectedCount} fragmentos.`,
    );
  }
  for (const vector of vectors) {
    if (vector.length === 0 || !vector.every((value) => Number.isFinite(value))) {
      throw new IndexError(
        `El proveedor de embeddings "${model}" devolvió un vector vacío o con valores no finitos.`,
      );
    }
  }
};

export const syncEmbeddings = async (
  db: IndexDatabase,
  provider: EmbeddingProvider,
  options?: SyncEmbeddingsOptions,
): Promise<SyncEmbeddingsResult> => {
  const model = provider.model.trim();
  if (model.length === 0) {
    throw new IndexError("El nombre del modelo de embeddings no puede estar vacío.");
  }

  const storedModel = db
    .select({ valor: meta.valor })
    .from(meta)
    .where(eq(meta.clave, EMBEDDINGS_MODEL_META_KEY))
    .get()?.valor;

  const PurgedOrModelChanged = storedModel !== model;

  if (PurgedOrModelChanged) {
    db.transaction((tx) => {
      tx.delete(embeddings).where(ne(embeddings.modelo, model)).run();
      tx.insert(meta)
        .values({ clave: EMBEDDINGS_MODEL_META_KEY, valor: model })
        .onConflictDoUpdate({
          target: meta.clave,
          set: { valor: model },
        })
        .run();
    });
  }

  const missingCondition = sql`NOT EXISTS (
    SELECT 1 FROM ${embeddings}
    WHERE ${embeddings.fragmentoId} = ${fragmentos.id}
      AND ${embeddings.modelo} = ${model}
  )`;

  const whereClause =
    options?.objetoId !== undefined
      ? and(eq(fragmentos.objetoId, options.objetoId), missingCondition)
      : missingCondition;

  const pending = db
    .select({
      id: fragmentos.id,
      encabezado: fragmentos.encabezado,
      texto: fragmentos.texto,
    })
    .from(fragmentos)
    .where(whereClause)
    .orderBy(asc(fragmentos.objetoId), asc(fragmentos.orden), asc(fragmentos.id))
    .all();

  if (pending.length === 0) {
    return {
      model,
      embedded: 0,
      PurgedOrModelChanged,
    };
  }

  const rawBatchSize = options?.batchSize ?? DEFAULT_EMBED_BATCH_SIZE;
  const batchSize =
    Number.isFinite(rawBatchSize) && rawBatchSize >= 1
      ? Math.floor(rawBatchSize)
      : DEFAULT_EMBED_BATCH_SIZE;

  let embedded = 0;

  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    const texts = batch.map((row) => formatFragmentForEmbedding(row.encabezado, row.texto));
    const vectors = await provider.embed(texts);
    validateVectors(vectors, batch.length, model);

    db.transaction((tx) => {
      for (let i = 0; i < batch.length; i += 1) {
        const row = batch[i];
        const vector = vectors[i];
        if (row === undefined || vector === undefined) {
          continue;
        }
        const encoded = encodeEmbeddingVector(vector);
        tx.insert(embeddings)
          .values({
            fragmentoId: row.id,
            modelo: model,
            vector: encoded,
          })
          .onConflictDoUpdate({
            target: [embeddings.fragmentoId, embeddings.modelo],
            set: { vector: encoded },
          })
          .run();
        embedded += 1;
      }
    });
  }

  return {
    model,
    embedded,
    PurgedOrModelChanged,
  };
};
