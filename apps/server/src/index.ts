import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { loadConfig } from "@migite/core";
import { app } from "./app.js";
import { avisosDeArranque, mensajeDeErrorDeServidor, resolverPuerto } from "./arranque.js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const arrancar = (): void => {
  const config = loadConfig({ root: raiz });
  const port = resolverPuerto(process.env.PORT);

  for (const aviso of avisosDeArranque(config)) {
    console.warn(aviso);
  }

  const servidor = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Migite escuchando en http://localhost:${info.port}`);
    console.log(`Configuración válida en ${raiz} (idioma ${config.app.idioma})`);
  });

  servidor.on("error", (error) => {
    console.error(mensajeDeErrorDeServidor(error));
    process.exitCode = 1;
  });
};

try {
  arrancar();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
