import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { loadConfig } from "@migite/core";
import { app } from "./app.js";
import { resolvePort, serverErrorMessage, startupWarnings } from "./startup.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const start = (): void => {
  const config = loadConfig({ root });
  const port = resolvePort(process.env.PORT);

  for (const warning of startupWarnings(config)) {
    console.warn(warning);
  }

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
