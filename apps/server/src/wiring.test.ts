import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppConfig } from "@migite/core";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import {
  type AuthOptions,
  createSessionToken,
  createStaticSessionStore,
  SESSION_COOKIE,
} from "./auth.js";
import { configureObjetos } from "./routes/objetos.js";
import { startRuntime } from "./runtime.js";

const config: AppConfig = {
  paths: { vault: "vault", index: "data/index.db" },
  timeZone: "Europe/Madrid",
  locale: "es",
};

const USUARIO = "ana";
const SECRETO = "secreto-de-test-suficientemente-largo";

const auth: AuthOptions = {
  store: createStaticSessionStore({
    usuario: USUARIO,
    passwordHash: "$argon2id$test",
    secretoSesion: SECRETO,
  }),
};

describe("wiring de objetos desde el runtime", () => {
  let root: string | undefined;
  let runtime: ReturnType<typeof startRuntime> | undefined;

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  it("serves an authenticated GET without the not-configured 500", async () => {
    root = mkdtempSync(join(tmpdir(), "migite-wiring-"));
    runtime = startRuntime(config, root);
    const app = createApp({ auth });
    const headers = {
      cookie: `${SESSION_COOKIE}=${createSessionToken({
        usuario: USUARIO,
        generacion: 0,
        secret: SECRETO,
      })}`,
    };

    const before = await app.request("/api/objetos", { headers });
    expect(before.status).toBe(500);

    configureObjetos({
      db: runtime.db,
      vaultDir: runtime.vaultDir,
      timeZone: config.timeZone,
    });

    const after = await app.request("/api/objetos", { headers });
    expect(after.status).toBe(200);
    expect(await after.json()).toEqual({ objetos: [], siguienteCursor: null });
  });
});
