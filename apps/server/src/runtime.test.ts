import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppConfig } from "@migite/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppRuntime, sanitizeWatcherError, startRuntime } from "./runtime.js";

const config: AppConfig = {
  paths: { vault: "vault", index: "data/index.db" },
  timeZone: "Europe/Madrid",
  locale: "es",
};

let root: string | undefined;
let runtime: AppRuntime | undefined;

afterEach(async () => {
  await runtime?.close();
  runtime = undefined;
  if (root !== undefined) {
    rmSync(root, { recursive: true, force: true });
    root = undefined;
  }
});

describe("startRuntime", () => {
  it("opens the configured index and watches the configured vault", async () => {
    root = mkdtempSync(join(tmpdir(), "migite-runtime-"));

    runtime = startRuntime(config, root);

    expect(runtime.dbPath).toBe(join(root, "data", "index.db"));
    expect(runtime.vaultDir).toBe(join(root, "vault"));
    expect(existsSync(runtime.dbPath)).toBe(true);
    expect(existsSync(join(root, "vault"))).toBe(true);

    await runtime.close();
    runtime = undefined;
  });

  it("expone el estado del watcher y queda listo tras el baseline", async () => {
    root = mkdtempSync(join(tmpdir(), "migite-runtime-"));
    const active = startRuntime(config, root);
    runtime = active;

    await vi.waitFor(() => expect(active.getWatchStatus().listo).toBe(true), { timeout: 5_000 });

    expect(active.getWatchStatus()).toEqual({ listo: true, ultimoError: null });
  });
});

describe("sanitizeWatcherError", () => {
  it("sustituye las rutas absolutas del vault", () => {
    const vaultDir = join(tmpdir(), "migite-vault");
    const message = sanitizeWatcherError(
      new Error(`ENOENT: no such file or directory, open '${join(vaultDir, "nota.md")}'`),
      vaultDir,
    );

    expect(message).not.toContain(vaultDir);
    expect(message).toContain("nota.md");
  });

  it("acepta errores que no son Error y limita la longitud", () => {
    expect(sanitizeWatcherError("fallo directo", "/tmp/vault")).toBe("fallo directo");
    expect(sanitizeWatcherError("x".repeat(500), "/tmp/vault")).toHaveLength(303);
  });
});
