import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildIndex,
  type IndexHandle,
  listObjectsIndexed,
  openIndex,
  searchObjects,
  startWatcher,
} from "../src/index.js";
import {
  BUILD_LIMIT_MS,
  formatMb,
  formatMs,
  generateVault,
  LIST_P95_LIMIT_MS,
  parseArgs,
  percentile,
  prepareQueries,
  SEARCH_P95_LIMIT_MS,
  time,
  verdict,
  WATCHER_LIMIT_MS,
} from "./scenario.js";

const main = async (): Promise<void> => {
  const config = parseArgs(process.argv.slice(2));
  const directory = mkdtempSync(join(tmpdir(), "migite-bench-"));
  const vaultDir = join(directory, "vault");
  const dbPath = join(directory, "index.db");
  const watcherDbPath = join(directory, "watcher.db");
  let handle: IndexHandle | undefined;
  let watcherHandle: IndexHandle | undefined;
  let failures = 0;

  try {
    process.stdout.write(`=== Bench @migite/index — ${config.notes} notas ===\n\n`);
    const generationMs = time(() => generateVault(config, vaultDir));
    process.stdout.write(`Generación del vault:   ${formatMs(generationMs)}\n`);

    handle = openIndex({ dbPath });
    const db = handle.db;
    const buildMs = time(() => {
      buildIndex(db, { vaultDir, timeZone: "UTC" });
    });
    const buildOk = buildMs < BUILD_LIMIT_MS;
    if (!buildOk) {
      failures += 1;
    }
    process.stdout.write(
      `buildIndex:             ${formatMs(buildMs)} (RNF-013 < 30 min: ${verdict(buildOk)})\n`,
    );

    const queries = prepareQueries(config);
    searchObjects(db, { query: "busq", limit: 100 });
    searchObjects(db, { limit: 100 });
    const searchDurations: number[] = [];
    let resultCount = 0;
    let slowest = { label: "", ms: 0 };
    for (const query of queries) {
      const elapsed = time(() => {
        resultCount += searchObjects(db, { ...query.options, limit: 100 }).length;
      });
      searchDurations.push(elapsed);
      if (elapsed > slowest.ms) {
        slowest = { label: query.label, ms: elapsed };
      }
    }
    const searchP50 = percentile(searchDurations, 0.5);
    const searchP95 = percentile(searchDurations, 0.95);
    const searchOk = searchP95 < SEARCH_P95_LIMIT_MS;
    if (!searchOk) {
      failures += 1;
    }
    process.stdout.write(
      `searchObjects:          p50 ${formatMs(searchP50)} · p95 ${formatMs(searchP95)} (RNF-010 < 500 ms: ${verdict(searchOk)})\n`,
    );
    process.stdout.write(
      `  ${queries.length} consultas, ${(resultCount / queries.length).toFixed(1)} resultados de media · más lenta: ${slowest.label} ${formatMs(slowest.ms)}\n`,
    );

    listObjectsIndexed(db, { limit: 100 });
    const listDurations = Array.from({ length: config.listSamples }, () =>
      time(() => {
        listObjectsIndexed(db, { limit: 100 });
      }),
    );
    const listP50 = percentile(listDurations, 0.5);
    const listP95 = percentile(listDurations, 0.95);
    const listOk = listP95 < LIST_P95_LIMIT_MS;
    if (!listOk) {
      failures += 1;
    }
    process.stdout.write(
      `listado 100 objetos:    p50 ${formatMs(listP50)} · p95 ${formatMs(listP95)} (RNF-011 < 300 ms: ${verdict(listOk)})\n`,
    );

    handle.close();
    handle = undefined;
    process.stdout.write(`Tamaño del índice:      ${formatMb(statSync(dbPath).size)}\n`);

    watcherHandle = openIndex({ dbPath: watcherDbPath });
    const watcher = startWatcher({
      db: watcherHandle.db,
      vaultDir,
      timeZone: "UTC",
    });
    const watcherStartedAt = performance.now();
    await watcher.ready;
    const listeningMs = performance.now() - watcherStartedAt;
    const listeningOk = listeningMs < WATCHER_LIMIT_MS;
    if (!listeningOk) {
      failures += 1;
    }
    process.stdout.write(
      `watcher escuchando:     ${formatMs(listeningMs)} (RNF-012 < 30 s: ${verdict(listeningOk)})\n`,
    );
    await watcher.synced;
    const syncedMs = performance.now() - watcherStartedAt;
    const syncedOk = syncedMs < BUILD_LIMIT_MS;
    if (!syncedOk) {
      failures += 1;
    }
    process.stdout.write(
      `watcher synced (build): ${formatMs(syncedMs)} (RNF-013 < 30 min: ${verdict(syncedOk)})\n`,
    );
    await watcher.close();
    watcherHandle.close();
    watcherHandle = undefined;

    process.stdout.write(
      `\nResultado: ${failures === 0 ? "todos los RNF OK" : `${failures} RNF fuera de umbral`}\n`,
    );
    process.exitCode = failures === 0 ? 0 : 1;
  } finally {
    watcherHandle?.close();
    handle?.close();
    if (config.keep) {
      process.stdout.write(`Vault y DB conservados en ${directory}\n`);
    } else {
      rmSync(directory, { recursive: true, force: true });
    }
  }
};

await main();
