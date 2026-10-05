import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { ConfigError, loadConfig } from "@migite/core";
import { app } from "./app.js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const arrancar = (): void => {
  const config = loadConfig({ root: raiz });
  const port = Number(process.env.PORT ?? 3000);

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Migite escuchando en http://localhost:${info.port}`);
    console.log(`Configuración válida en ${raiz} (idioma ${config.app.idioma})`);
  });
};

try {
  arrancar();
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exitCode = 1;
}
