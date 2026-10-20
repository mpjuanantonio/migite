import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AppConfig, NATIVE_TYPE_IDS } from "@migite/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import {
  type AuthOptions,
  createSessionToken,
  createStaticSessionStore,
  SESSION_COOKIE,
} from "./auth.js";
import { configureObjetos } from "./routes/objetos.js";
import { type AppRuntime, sanitizeWatcherError, startRuntime } from "./runtime.js";

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

const sessionHeaders = (): Record<string, string> => ({
  cookie: `${SESSION_COOKIE}=${createSessionToken({
    usuario: USUARIO,
    generacion: 0,
    secret: SECRETO,
  })}`,
});

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

  it("siembra los tipos nativos al arrancar sobre un vault vacío", () => {
    root = mkdtempSync(join(tmpdir(), "migite-runtime-"));
    runtime = startRuntime(config, root);

    for (const id of NATIVE_TYPE_IDS) {
      const path = join(root, "vault", "tipos", `${id}.yaml`);
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, "utf8")).toContain(`id: ${id}`);
    }
  });

  it("permite crear tareas y recordatorios por API en un vault recién arrancado", async () => {
    root = mkdtempSync(join(tmpdir(), "migite-runtime-"));
    const active = startRuntime(config, root);
    runtime = active;
    configureObjetos({ db: active.db, vaultDir: active.vaultDir, timeZone: config.timeZone });
    const app = createApp({ auth });
    const headers = { ...sessionHeaders(), "content-type": "application/json" };

    const tarea = await app.request("/api/objetos", {
      method: "POST",
      headers,
      body: JSON.stringify({
        titulo: "Preparar informe",
        tipo: "tarea",
        atributos: { estado: "pendiente" },
      }),
    });
    const recordatorio = await app.request("/api/objetos", {
      method: "POST",
      headers,
      body: JSON.stringify({
        titulo: "Llamar al banco",
        tipo: "recordatorio",
        atributos: { estado: "pendiente", hora: "2026-10-14T10:00:00+02:00" },
      }),
    });

    expect(tarea.status).toBe(201);
    expect(((await tarea.json()) as { tipo: string }).tipo).toBe("tarea");
    expect(recordatorio.status).toBe(201);
    expect(((await recordatorio.json()) as { tipo: string }).tipo).toBe("recordatorio");
  });

  it("no sobrescribe los tipos existentes, incluido un YAML editado a mano", () => {
    root = mkdtempSync(join(tmpdir(), "migite-runtime-"));
    const tiposDir = join(root, "vault", "tipos");
    mkdirSync(tiposDir, { recursive: true });
    const editado = `id: nota
nombre: Nota personal
descripcion: Definición ajustada por el usuario
atributos: []
`;
    writeFileSync(join(tiposDir, "nota.yaml"), editado, "utf8");

    runtime = startRuntime(config, root);

    expect(readFileSync(join(tiposDir, "nota.yaml"), "utf8")).toBe(editado);
    for (const id of NATIVE_TYPE_IDS.filter((nativeId) => nativeId !== "nota")) {
      expect(existsSync(join(tiposDir, `${id}.yaml`))).toBe(true);
    }
  });
});

describe("sanitizeWatcherError", () => {
  it("elimina rutas absolutas del vault y del resto del servidor", () => {
    const vaultDir = join(tmpdir(), "migite-vault");
    const message = sanitizeWatcherError(
      new Error(`ENOENT: no such file or directory, open '${join(vaultDir, "nota.md")}'`),
      vaultDir,
    );

    expect(message).not.toContain(vaultDir);
    expect(message).not.toContain("nota.md");
    expect(message).toContain("[ruta]");
  });

  it("elimina rutas absolutas ajenas al vault", () => {
    const message = sanitizeWatcherError(
      new Error("EACCES: permission denied, scandir '/var/lib/migite/data'"),
      "/tmp/vault",
    );

    expect(message).not.toContain("/var/lib/migite");
    expect(message).toContain("[ruta]");
  });

  it("acepta errores que no son Error y limita la longitud", () => {
    expect(sanitizeWatcherError("fallo directo", "/tmp/vault")).toBe("fallo directo");
    expect(sanitizeWatcherError("x".repeat(500), "/tmp/vault")).toHaveLength(303);
  });
});
