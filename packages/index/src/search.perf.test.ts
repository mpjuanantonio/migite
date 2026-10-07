import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapVault, newUlid, writeObjectFile } from "@migite/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildIndex } from "./indexer.js";
import { type IndexHandle, openIndex } from "./open.js";
import { searchObjects } from "./search.js";

const NOTE_COUNT = 2000;

const WORDS = [
  "búsqueda",
  "índice",
  "reunión",
  "código",
  "diseño",
  "migración",
  "informe",
  "prueba",
  "equipo",
  "cliente",
  "sistema",
  "usuario",
  "documento",
  "objetivo",
  "métrica",
];

const TAGS = ["trabajo", "personal", "urgente", "idea", "archivo"];

const TERMS = ["busq", "indice", "reuni", "migracion", "equipo", "cliente", "usuario", "info"];

let directory: string;
let vaultDir: string;
let handle: IndexHandle;

const p95 = (durations: readonly number[]): number => {
  const sorted = [...durations].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
};

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "migite-search-perf-"));
  vaultDir = join(directory, "vault");
  bootstrapVault(vaultDir);
  mkdirSync(join(vaultDir, "notas"), { recursive: true });
  const base = Date.UTC(2026, 0, 1);

  for (let i = 0; i < NOTE_COUNT; i += 1) {
    const words = Array.from(
      { length: 12 },
      (_, offset) => WORDS[(i * 3 + offset) % WORDS.length] ?? "nota",
    );
    const title = `${WORDS[i % WORDS.length] ?? "nota"} ${i}`;
    const updated = new Date(base - i * 60_000).toISOString();
    const text = writeObjectFile(
      {
        id: newUlid(),
        type: "nota",
        title,
        created: updated,
        updated,
        links: [],
        attributes: { etiquetas: [TAGS[i % TAGS.length] ?? "trabajo"] },
      },
      words.join(" "),
    );
    writeFileSync(join(vaultDir, "notas", `${i}.md`), text, "utf8");
  }

  handle = openIndex({ dbPath: join(directory, "index.db") });
  buildIndex(handle.db, { vaultDir, timeZone: "UTC" });
}, 120_000);

afterAll(() => {
  handle.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("searchObjects a escala", () => {
  it("responde consultas sobre 2000 notas en menos de 200 ms", () => {
    const durations = TERMS.map((term) => {
      const startedAt = performance.now();
      const results = searchObjects(handle.db, { query: term, limit: 100 });
      const elapsed = performance.now() - startedAt;
      expect(results.length).toBeGreaterThan(0);
      return elapsed;
    });
    const worst = p95(durations);

    expect(worst).toBeLessThan(200);
  });
});
