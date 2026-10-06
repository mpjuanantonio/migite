import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { AppConfig } from "@migite/core";
import { type IndexDatabase, openIndex, startWatcher } from "@migite/index";

export type AppRuntime = {
  readonly db: IndexDatabase;
  readonly dbPath: string;
  readonly vaultDir: string;
  readonly close: () => Promise<void>;
};

export const startRuntime = (config: AppConfig, root: string): AppRuntime => {
  const vaultDir = resolve(root, config.paths.vault);
  const handle = openIndex({ dbPath: resolve(root, config.paths.index) });
  try {
    mkdirSync(vaultDir, { recursive: true });
    const watcher = startWatcher({
      db: handle.db,
      vaultDir,
      timeZone: config.timeZone,
    });
    return {
      db: handle.db,
      dbPath: handle.dbPath,
      vaultDir,
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
