import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Salud, saludSchema } from "@migite/contracts";
import { type AppConfig, bootstrapVault, createObjectRepository } from "@migite/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { type AuthOptions, createStaticSessionStore } from "../auth.js";
import { type AppRuntime, startRuntime } from "../runtime.js";
import { contarObjetosIndexados } from "../services/salud.js";
import { configureHealth } from "./health.js";

const config: AppConfig = {
  paths: { vault: "vault", index: "data/index.db" },
  timeZone: "Europe/Madrid",
  locale: "es",
};

const auth: AuthOptions = {
  store: createStaticSessionStore({
    usuario: "tester",
    passwordHash: "$argon2id$test",
    secretoSesion: "secreto-de-test-suficientemente-largo",
  }),
};

const getHealth = async (): Promise<Salud> => {
  const res = await createApp({ auth }).request("/api/health");
  expect(res.status).toBe(200);
  return saludSchema.parse(await res.json());
};

describe("GET /api/health", () => {
  it("es público y publica el estado del índice", async () => {
    configureHealth({
      contarObjetos: () => 3,
      estadoWatcher: () => ({ listo: true, ultimoError: null }),
      version: "9.9.9",
    });

    expect(await getHealth()).toEqual({
      status: "ok",
      indice: { objetos: 3, listo: true, ultimoError: null },
      version: "9.9.9",
    });
  });

  it("marca degradado si el índice no está listo o el watcher reporta un error", async () => {
    configureHealth({
      contarObjetos: () => 0,
      estadoWatcher: () => ({ listo: false, ultimoError: null }),
    });
    expect(await getHealth()).toEqual({
      status: "degradado",
      indice: { objetos: 0, listo: false, ultimoError: null },
    });

    configureHealth({
      contarObjetos: () => 2,
      estadoWatcher: () => ({ listo: true, ultimoError: "no se pudo indexar ./danado.md" }),
    });
    expect(await getHealth()).toEqual({
      status: "degradado",
      indice: { objetos: 2, listo: true, ultimoError: "no se pudo indexar ./danado.md" },
    });
  });

  it("sanea las rutas absolutas del ultimoError", async () => {
    configureHealth({
      contarObjetos: () => 1,
      estadoWatcher: () => ({
        listo: true,
        ultimoError: "EACCES: permission denied, open '/home/ana/vault/privado.md'",
      }),
    });

    const body = await getHealth();
    expect(body.indice.ultimoError).not.toContain("/home/ana");
    expect(body.indice.ultimoError).toContain("[ruta]");
  });
});

describe("GET /api/health con el runtime real", () => {
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

  it("cuenta los objetos indexados y queda listo tras el baseline del watcher", async () => {
    root = mkdtempSync(join(tmpdir(), "migite-health-"));
    const active = startRuntime(config, root);
    runtime = active;
    bootstrapVault(active.vaultDir);
    const repository = createObjectRepository({
      vaultDir: active.vaultDir,
      timeZone: config.timeZone,
    });
    repository.createObject({ title: "Uno", type: "nota", body: "primera nota" });
    repository.createObject({ title: "Dos", type: "nota", body: "segunda nota" });

    await vi.waitFor(
      () => {
        expect(contarObjetosIndexados(active.db)).toBe(2);
        expect(active.getWatchStatus().listo).toBe(true);
      },
      { timeout: 5_000 },
    );

    configureHealth({
      contarObjetos: () => contarObjetosIndexados(active.db),
      estadoWatcher: active.getWatchStatus,
    });

    expect(await getHealth()).toEqual({
      status: "ok",
      indice: { objetos: 2, listo: true, ultimoError: null },
    });
  });
});
