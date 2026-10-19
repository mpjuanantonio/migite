import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapVault, createObjectRepository, type ObjectRepository } from "@migite/core";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EMBED_BATCH_SIZE,
  decodeEmbeddingVector,
  EMBEDDINGS_MODEL_META_KEY,
  type EmbeddingProvider,
  encodeEmbeddingVector,
  syncEmbeddings,
} from "./embeddings.js";
import { applyObjectEvent, buildIndex } from "./indexer.js";
import { type IndexHandle, openIndex } from "./open.js";
import { embeddings, fragmentos, meta } from "./schema.js";

let directory: string;
let vaultDir: string;
let handle: IndexHandle;
let repo: ObjectRepository;

const createFakeProvider = (
  model: string,
  dims = 3,
): {
  readonly provider: EmbeddingProvider;
  readonly calls: string[][];
} => {
  const calls: string[][] = [];
  const provider: EmbeddingProvider = {
    model,
    embed: async (texts) => {
      calls.push([...texts]);
      return texts.map((text, idx) => {
        const base = text.length + idx;
        return Array.from({ length: dims }, (_, d) => (base + d + 1) * 0.25);
      });
    },
  };
  return { provider, calls };
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "migite-embeddings-"));
  vaultDir = join(directory, "vault");
  bootstrapVault(vaultDir);
  repo = createObjectRepository({ vaultDir, timeZone: "UTC" });
  handle = openIndex({ dbPath: join(directory, "index.db") });
});

afterEach(() => {
  handle.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("encodeEmbeddingVector / decodeEmbeddingVector", () => {
  it("encodes and decodes Float32Array vectors accurately including unaligned Uint8Array views", () => {
    expect(DEFAULT_EMBED_BATCH_SIZE).toBe(32);
    const input = [0.25, -1.5, 3.125, 0, 42.5];
    const encoded = encodeEmbeddingVector(input);
    expect(encoded.byteLength).toBe(input.length * 4);

    const decoded = decodeEmbeddingVector(encoded);
    expect(Array.from(decoded)).toEqual(input);

    const padded = new Uint8Array(encoded.byteLength + 3);
    padded.set(encoded, 1);
    const unalignedView = padded.subarray(1, 1 + encoded.byteLength);
    expect(unalignedView.byteOffset % 4).not.toBe(0);

    const decodedUnaligned = decodeEmbeddingVector(unalignedView);
    expect(Array.from(decodedUnaligned)).toEqual(input);
  });
});

describe("syncEmbeddings", () => {
  it("embeds pending fragments in batches and persists model version in meta", async () => {
    repo.createObject({
      title: "Nota 1",
      type: "nota",
      body: "# Uno\nTexto uno.\n\n# Dos\nTexto dos.\n\n# Tres\nTexto tres.\n",
    });
    buildIndex(handle.db, { vaultDir });

    const { provider, calls } = createFakeProvider("text-embedding-3-small");
    const result = await syncEmbeddings(handle.db, provider, { batchSize: 2 });

    expect(result).toEqual({
      model: "text-embedding-3-small",
      embedded: 3,
      PurgedOrModelChanged: true,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(["Uno\n\nTexto uno.", "Dos\n\nTexto dos."]);
    expect(calls[1]).toEqual(["Tres\n\nTexto tres."]);

    const storedMeta = handle.db
      .select()
      .from(meta)
      .where(eq(meta.clave, EMBEDDINGS_MODEL_META_KEY))
      .get();
    expect(storedMeta?.valor).toBe("text-embedding-3-small");

    const storedEmbeddings = handle.db.select().from(embeddings).all();
    expect(storedEmbeddings).toHaveLength(3);
    for (const row of storedEmbeddings) {
      expect(row.modelo).toBe("text-embedding-3-small");
      const vec = decodeEmbeddingVector(row.vector as Buffer);
      expect(vec).toHaveLength(3);
    }
  });

  it("is idempotent and makes zero provider calls when all fragments are already embedded", async () => {
    repo.createObject({
      title: "Nota estable",
      type: "nota",
      body: "# A\nAlfa.\n\n# B\nBeta.\n",
    });
    buildIndex(handle.db, { vaultDir });

    const { provider, calls } = createFakeProvider("embed-v1");
    await syncEmbeddings(handle.db, provider);
    expect(calls).toHaveLength(1);

    const second = await syncEmbeddings(handle.db, provider);
    expect(second).toEqual({
      model: "embed-v1",
      embedded: 0,
      PurgedOrModelChanged: false,
    });
    expect(calls).toHaveLength(1);
  });

  it("re-embeds only the modified section when a note is partially updated", async () => {
    const nota = repo.createObject({
      title: "Nota editable",
      type: "nota",
      body: "# Intacta\nSección que no cambia.\n\n# Cambiante\nVersión inicial.\n",
    });
    buildIndex(handle.db, { vaultDir });

    const { provider, calls } = createFakeProvider("embed-v1");
    await syncEmbeddings(handle.db, provider);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(2);

    repo.updateObject(nota.id, {
      body: "# Intacta\nSección que no cambia.\n\n# Cambiante\nVersión actualizada.\n",
    });
    applyObjectEvent(
      handle.db,
      { type: "ObjectUpdated", objectId: nota.id, path: nota.path },
      { vaultDir },
    );

    const updateSync = await syncEmbeddings(handle.db, provider);
    expect(updateSync).toEqual({
      model: "embed-v1",
      embedded: 1,
      PurgedOrModelChanged: false,
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(["Cambiante\n\nVersión actualizada."]);
  });

  it("purges old embeddings, updates meta, and re-embeds all fragments when provider.model changes", async () => {
    repo.createObject({
      title: "Nota modelo",
      type: "nota",
      body: "# S1\nContenido 1.\n\n# S2\nContenido 2.\n",
    });
    buildIndex(handle.db, { vaultDir });

    const firstProvider = createFakeProvider("model-old", 3);
    await syncEmbeddings(handle.db, firstProvider.provider);
    expect(handle.db.select().from(embeddings).all()).toHaveLength(2);

    const secondProvider = createFakeProvider("model-new", 4);
    const result = await syncEmbeddings(handle.db, secondProvider.provider);

    expect(result).toEqual({
      model: "model-new",
      embedded: 2,
      PurgedOrModelChanged: true,
    });

    const storedMeta = handle.db
      .select()
      .from(meta)
      .where(eq(meta.clave, EMBEDDINGS_MODEL_META_KEY))
      .get();
    expect(storedMeta?.valor).toBe("model-new");

    const allEmbeddings = handle.db.select().from(embeddings).all();
    const allFragments = handle.db.select().from(fragmentos).all();
    expect(allEmbeddings).toHaveLength(allFragments.length);
    expect(allEmbeddings.every((row) => row.modelo === "model-new")).toBe(true);
    for (const row of allEmbeddings) {
      expect(decodeEmbeddingVector(row.vector as Buffer)).toHaveLength(4);
    }
  });
});
