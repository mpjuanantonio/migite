import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { loadConfig } from "@migite/core";
import { createOpenAICompatClient } from "@migite/llm";
import { createApp } from "./app.js";
import { loadAuthConfig } from "./auth.js";
import { configureAcciones } from "./routes/acciones.js";
import { configureBuscar } from "./routes/buscar.js";
import { configureChat } from "./routes/chat.js";
import { configureConversaciones } from "./routes/conversaciones.js";
import { configureExport } from "./routes/export.js";
import { configureHealth } from "./routes/health.js";
import { configureMemorias } from "./routes/memorias.js";
import { configureObjetos } from "./routes/objetos.js";
import { configureTipos } from "./routes/tipos.js";
import { startRuntime } from "./runtime.js";
import { contarObjetosIndexados } from "./services/salud.js";
import { createIndexSessionStore } from "./session-store.js";
import { resolvePort, serverErrorMessage, startupWarnings } from "./startup.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const serverVersion = (): string | undefined => {
  try {
    const manifest = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
    ) as { version?: unknown };
    return typeof manifest.version === "string" ? manifest.version : undefined;
  } catch {
    return undefined;
  }
};

const start = (): void => {
  const config = loadConfig({ root });
  const port = resolvePort(process.env.PORT);
  const authConfig = loadAuthConfig(config.app.locale);
  const version = serverVersion();

  for (const warning of startupWarnings(config)) {
    console.warn(warning);
  }

  const runtime = startRuntime(config.app, root);
  configureObjetos({
    db: runtime.db,
    vaultDir: runtime.vaultDir,
    timeZone: config.app.timeZone,
  });
  configureAcciones({
    db: runtime.db,
    vaultDir: runtime.vaultDir,
    timeZone: config.app.timeZone,
  });
  configureChat({
    client: createOpenAICompatClient(config.llm),
    db: runtime.db,
    vaultDir: runtime.vaultDir,
    timeZone: config.app.timeZone,
    locale: config.app.locale,
  });
  configureConversaciones({ db: runtime.db });
  configureMemorias({ db: runtime.db });
  configureTipos({ tiposDir: join(runtime.vaultDir, "tipos") });
  configureBuscar({ db: runtime.db });
  configureExport({ vaultDir: runtime.vaultDir });
  configureHealth({
    contarObjetos: () => contarObjetosIndexados(runtime.db),
    estadoWatcher: runtime.getWatchStatus,
    ...(version === undefined ? {} : { version }),
  });
  const app = createApp({
    locale: config.app.locale,
    auth: { store: createIndexSessionStore(runtime.db, authConfig) },
  });

  const shutdown = (): void => {
    void runtime.close().finally(() => {
      process.exit(0);
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Migite listening on http://localhost:${info.port}`);
    console.log(`Valid config at ${root} (locale ${config.app.locale})`);
  });

  server.on("error", (error) => {
    console.error(serverErrorMessage(error));
    process.exitCode = 1;
  });
};

try {
  start();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
