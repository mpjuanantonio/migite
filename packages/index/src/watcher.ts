import type { Stats } from "node:fs";
import { relative, resolve } from "node:path";
import { RESERVED_ROOT_DIRS } from "@migite/core";
import { watch } from "chokidar";
import { applyObjectEvent, runReindex } from "./indexer.js";
import type { IndexDatabase } from "./open.js";

export type WatcherErrorHandler = (error: unknown, path: string) => void;

export type StartWatcherOptions = {
  readonly db: IndexDatabase;
  readonly vaultDir: string;
  readonly timeZone?: string;
  readonly debounceMs?: number;
  readonly onError?: WatcherErrorHandler;
};

export type WatcherHandle = {
  readonly close: () => Promise<void>;
  readonly ready: Promise<void>;
  readonly synced: Promise<void>;
};

type PendingKind = "add" | "change" | "unlink";

const DEFAULT_DEBOUNCE_MS = 200;

const MARKDOWN_FILE = /\.md$/i;

const toPosix = (value: string): string => value.replaceAll("\\", "/");

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const reservedAtRoot = (segments: readonly string[]): boolean =>
  (RESERVED_ROOT_DIRS as readonly string[]).includes(segments[0] ?? "");

export const startWatcher = (options: StartWatcherOptions): WatcherHandle => {
  const vaultDir = resolve(options.vaultDir);
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const reportError: WatcherErrorHandler =
    options.onError ??
    ((error, path) => {
      console.warn(`watcher: no se pudo indexar "${path}": ${describeError(error)}`);
    });

  const isIgnored = (path: string, stats?: Stats): boolean => {
    const relativePath = toPosix(relative(vaultDir, path));
    if (relativePath === "") {
      return false;
    }
    if (relativePath === ".." || relativePath.startsWith("../")) {
      return true;
    }
    if (reservedAtRoot(relativePath.split("/"))) {
      return true;
    }
    if (stats?.isDirectory() === true) {
      return false;
    }
    return !MARKDOWN_FILE.test(relativePath);
  };

  const relativePathOf = (path: string): string | undefined => {
    const relativePath = toPosix(relative(vaultDir, path));
    if (relativePath === "" || relativePath === ".." || relativePath.startsWith("../")) {
      return undefined;
    }
    return relativePath;
  };

  const pending = new Map<string, PendingKind>();
  let timer: NodeJS.Timeout | undefined;
  let ready = false;
  let closed = false;
  let queue: Promise<void> = Promise.resolve();
  let markReady: () => void = () => {};
  let markSynced: () => void = () => {};
  const readyPromise = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  const syncedPromise = new Promise<void>((resolve) => {
    markSynced = resolve;
  });

  const applyPending = (relativePath: string, kind: PendingKind): void => {
    applyObjectEvent(
      options.db,
      {
        type:
          kind === "unlink" ? "ObjectDeleted" : kind === "add" ? "ObjectCreated" : "ObjectUpdated",
        objectId: relativePath,
        path: relativePath,
      },
      { vaultDir, timeZone: options.timeZone },
    );
  };

  const flush = (): void => {
    timer = undefined;
    const batch = [...pending];
    pending.clear();
    for (const [relativePath, kind] of batch) {
      queue = queue
        .then(() => applyPending(relativePath, kind))
        .catch((error) => reportError(error, relativePath));
    }
  };

  const schedule = (relativePath: string, kind: PendingKind): void => {
    if (closed) {
      return;
    }
    pending.set(relativePath, kind);
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(flush, debounceMs);
  };

  const handleEvent = (path: string, kind: PendingKind): void => {
    if (!ready) {
      return;
    }
    const relativePath = relativePathOf(path);
    if (relativePath !== undefined) {
      schedule(relativePath, kind);
    }
  };

  const watcher = watch(vaultDir, {
    ignored: isIgnored,
    ignoreInitial: false,
    followSymlinks: false,
  });

  watcher.on("add", (path) => handleEvent(path, "add"));
  watcher.on("change", (path) => handleEvent(path, "change"));
  watcher.on("unlink", (path) => handleEvent(path, "unlink"));
  watcher.on("error", (error) => reportError(error, vaultDir));
  watcher.on("ready", () => {
    if (closed) {
      return;
    }
    ready = true;
    markReady();
    queue = queue
      .then(() => {
        runReindex(options.db, { vaultDir, timeZone: options.timeZone });
      })
      .catch((error) => reportError(error, vaultDir))
      .finally(markSynced);
  });

  const close = async (): Promise<void> => {
    if (closed) {
      return;
    }
    closed = true;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    pending.clear();
    markReady();
    markSynced();
    await watcher.close();
    await queue;
  };

  return { close, ready: readyPromise, synced: syncedPromise };
};
