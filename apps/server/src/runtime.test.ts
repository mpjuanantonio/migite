import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppConfig } from "@migite/core";
import { afterEach, describe, expect, it } from "vitest";
import { type AppRuntime, startRuntime } from "./runtime.js";

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
});
