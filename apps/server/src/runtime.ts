import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { AppConfig } from "@migite/core";
import { type IndexDatabase, openIndex, startWatcher } from "@migite/index";

export type WatchStatus = {
  readonly listo: boolean;
  readonly ultimoError: string | null;
};

export type AppRuntime = {
  readonly db: IndexDatabase;
  readonly dbPath: string;
  readonly vaultDir: string;
  readonly getWatchStatus: () => WatchStatus;
  readonly close: () => Promise<void>;
};

const MAX_ERROR_LENGTH = 300;

export const sanitizeWatcherError = (error: unknown, vaultDir: string): string => {
  const raw = error instanceof Error ? error.message : String(error);
  const plain = raw.replaceAll(vaultDir, ".").replace(/\s+/g, " ").trim();
  return plain.length > MAX_ERROR_LENGTH ? `${plain.slice(0, MAX_ERROR_LENGTH)}...` : plain;
};

export const startRuntime = (config: AppConfig, root: string): AppRuntime => {
  const vaultDir = resolve(root, config.paths.vault);
  const handle = openIndex({ dbPath: resolve(root, config.paths.index) });
  try {
    mkdirSync(vaultDir, { recursive: true });
    let listo = false;
    let ultimoError: string | null = null;
    const watcher = startWatcher({
      db: handle.db,
      vaultDir,
      timeZone: config.timeZone,
      onError: (error) => {
        ultimoError = sanitizeWatcherError(error, vaultDir);
      },
    });
    void watcher.synced.then(() => {
      listo = true;
    });
    return {
      db: handle.db,
      dbPath: handle.dbPath,
      vaultDir,
      getWatchStatus: () => ({ listo, ultimoError }),
      close: async () => {
        await watcher.close();
        handle.close();
      },
    };
  } catch (error) {
    handle.close();
    throw error;
  }
};
