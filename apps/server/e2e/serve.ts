import { mkdirSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { loadConfig, seedNativeTypes } from "@migite/core";
import { createApp } from "../src/app.js";
import { loadAuthConfig } from "../src/auth.js";
import { configureBuscar } from "../src/routes/buscar.js";
import { configureExport } from "../src/routes/export.js";
import { configureHealth } from "../src/routes/health.js";
import { configureObjetos } from "../src/routes/objetos.js";
import { configureTipos } from "../src/routes/tipos.js";
import { startRuntime } from "../src/runtime.js";
import { contarObjetosIndexados } from "../src/services/salud.js";
import { createIndexSessionStore } from "../src/session-store.js";
import { resolvePort } from "../src/startup.js";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const dataRoot = ((): string => {
  const configured = process.env.E2E_ROOT ?? ".e2e";
  return isAbsolute(configured) ? configured : resolve(serverRoot, configured);
})();

process.env.MIGITE_USER = "";
process.env.MIGITE_PASSWORD_HASH = "";

rmSync(dataRoot, { recursive: true, force: true });
mkdirSync(dataRoot, { recursive: true });

const config = loadConfig({ root: serverRoot });
const authConfig = loadAuthConfig(config.app.locale);
const runtime = startRuntime(
  {
    ...config.app,
    paths: { vault: join(dataRoot, "vault"), index: join(dataRoot, "index.db") },
  },
  dataRoot,
);

configureObjetos({
  db: runtime.db,
  vaultDir: runtime.vaultDir,
  timeZone: config.app.timeZone,
});
configureTipos({ tiposDir: join(runtime.vaultDir, "tipos") });
seedNativeTypes(join(runtime.vaultDir, "tipos"));
configureBuscar({ db: runtime.db });
configureExport({ vaultDir: runtime.vaultDir });
configureHealth({
  contarObjetos: () => contarObjetosIndexados(runtime.db),
  estadoWatcher: runtime.getWatchStatus,
});

const app = createApp({
  locale: config.app.locale,
  auth: { store: createIndexSessionStore(runtime.db, authConfig) },
});

const port = resolvePort(process.env.PORT);

const shutdown = (): void => {
  void runtime.close().finally(() => {
    process.exit(0);
  });
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`Migite E2E listening on http://127.0.0.1:${info.port} (datos en ${dataRoot})`);
});

server.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
