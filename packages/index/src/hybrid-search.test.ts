import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapVault, createObjectRepository, type ObjectRepository } from "@migite/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type EmbeddingProvider, syncEmbeddings } from "./embeddings.js";
import {
  cosineSimilarity,
  DEFAULT_CANDIDATE_MULTIPLIER,
  DEFAULT_RRF_K,
  searchKnowledge,
  searchKnowledgeHybrid,
} from "./hybrid-search.js";
import { buildIndex } from "./indexer.js";
import { type IndexHandle, openIndex } from "./open.js";

let directory: string;
let vaultDir: string;
let handle: IndexHandle;
let repo: ObjectRepository;

const semanticVectorFor = (text: string): readonly number[] => {
  const normalized = text.toLowerCase();
  if (normalized.includes("presupuesto") && normalized.includes("contabilidad")) {
    return [1, 0, 0];
  }
  if (normalized.includes("contabilidad") || normalized.includes("facturas")) {
    return [0.95, 0.1, 0];
  }
  if (normalized.includes("presupuesto") && normalized.includes("sin detalles")) {
    return [0, 0, 0];
  }
  if (normalized.includes("presupuesto")) {
    return [1, 0, 0];
  }
  if (normalized.includes("vuelo") || normalized.includes("hotel")) {
    return [-1, 0, 1];
  }
  return [0, 0, 0];
};

const createSemanticProvider = (model = "semantic-v1"): EmbeddingProvider => ({
  model,
  embed: async (texts) => texts.map(semanticVectorFor),
});

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "migite-hybrid-search-"));
  vaultDir = join(directory, "vault");
  bootstrapVault(vaultDir);
  repo = createObjectRepository({ vaultDir, timeZone: "UTC" });
  handle = openIndex({ dbPath: join(directory, "index.db") });
});

afterEach(() => {
  handle.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("cosineSimilarity", () => {
  it("computes cosine similarity and handles edge cases safely", () => {
    expect(DEFAULT_RRF_K).toBe(60);
    expect(DEFAULT_CANDIDATE_MULTIPLIER).toBe(4);
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });
});

describe("searchKnowledge & searchKnowledgeHybrid", () => {
  it("retrieves notes via semantic similarity even without lexical overlap and combines rankings with RRF", async () => {
    const soloLexica = repo.createObject({
      title: "Revisión trimestral",
      type: "nota",
      body: "# Resumen\nEl presupuesto fue aprobado ayer sin detalles adicionales.\n",
      attributes: { etiquetas: ["trabajo"] },
    });
    const soloSemantica = repo.createObject({
      title: "Cierre anual",
      type: "nota",
      body: "# Introducción\nNotas generales.\n\n# Contabilidad y facturas\nDesglose de gastos operativos del ejercicio.\n",
      attributes: { etiquetas: ["trabajo"] },
    });
    const ambasRamas = repo.createObject({
      title: "Plan financiero",
      type: "nota",
      body: "# Presupuesto operativo\nControl de gastos y contabilidad mensual.\n",
      attributes: { etiquetas: ["trabajo"] },
    });
    repo.createObject({
      title: "Vacaciones",
      type: "nota",
      body: "# Vuelo y hotel\nReserva del viaje de verano.\n",
      attributes: { etiquetas: ["personal"] },
    });

    buildIndex(handle.db, { vaultDir });
    const provider = createSemanticProvider();
    await syncEmbeddings(handle.db, provider);

    const results = await searchKnowledgeHybrid(handle.db, {
      query: "presupuesto",
      embeddingProvider: provider,
    });

    expect(results.map((r) => r.id)).toEqual([ambasRamas.id, soloSemantica.id, soloLexica.id]);
    expect(results[0]?.encabezado).toBe("Presupuesto operativo");
    expect(results[1]?.id).toBe(soloSemantica.id);
    expect(results[1]?.encabezado).toBe("Contabilidad y facturas");
    expect(results[1]?.snippet).toContain("gastos operativos");
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it("applies ObjectFilters across both lexical and semantic candidates", async () => {
    const trabajo = repo.createObject({
      title: "Facturas Q1",
      type: "nota",
      folder: "finanzas",
      body: "# Contabilidad\nRegistro de facturas.\n",
      attributes: { etiquetas: ["trabajo"] },
    });
    repo.createObject({
      title: "Facturas personales",
      type: "nota",
      folder: "hogar",
      body: "# Gastos\nContabilidad doméstica y facturas.\n",
      attributes: { etiquetas: ["personal"] },
    });

    buildIndex(handle.db, { vaultDir });
    const provider = createSemanticProvider();

    const filtered = await searchKnowledgeHybrid(handle.db, {
      query: "presupuesto",
      filters: { carpeta: "finanzas", tag: "trabajo" },
      embeddingProvider: provider,
    });

    expect(filtered.map((r) => r.id)).toEqual([trabajo.id]);
    expect(filtered[0]?.encabezado).toBe("Contabilidad");
  });

  it("degrades cleanly to lexical FTS5 search when provider fails or queryVector is omitted", async () => {
    const nota = repo.createObject({
      title: "Arquitectura",
      type: "nota",
      body: "# Preliminar\nContexto.\n\n# Decisiones\nUsamos SQLite con FTS5 para índice local.\n",
    });
    buildIndex(handle.db, { vaultDir });

    const failingProvider: EmbeddingProvider = {
      model: "broken-model",
      embed: async () => {
        throw new Error("network down");
      },
    };

    const fromFailing = await searchKnowledgeHybrid(handle.db, {
      query: "SQLite",
      embeddingProvider: failingProvider,
    });

    expect(fromFailing).toHaveLength(1);
    expect(fromFailing[0]?.id).toBe(nota.id);
    expect(fromFailing[0]?.encabezado).toBe("Decisiones");
    expect(fromFailing[0]?.fragmentoId).toBeDefined();

    const syncLexical = searchKnowledge(handle.db, { query: "SQLite" });
    expect(syncLexical).toHaveLength(1);
    expect(syncLexical[0]?.id).toBe(nota.id);
    expect(syncLexical[0]?.encabezado).toBe("Decisiones");
  });
});
