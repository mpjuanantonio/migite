import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { buscarRouter } from "./routes/buscar.js";
import { exportRouter } from "./routes/export.js";
import { mantenimientoRouter } from "./routes/mantenimiento.js";
import { objetosRouter } from "./routes/objetos.js";
import { tiposRouter } from "./routes/tipos.js";

export const app = new Hono();

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.route("/api/objetos", objetosRouter);
app.route("/api/tipos", tiposRouter);
app.route("/api/buscar", buscarRouter);
app.route("/api/export", exportRouter);
app.route("/api/mantenimiento", mantenimientoRouter);

const webDist = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "dist");

if (existsSync(webDist)) {
  app.use("*", serveStatic({ root: webDist }));

  const spaFallback = serveStatic({
    root: webDist,
    rewriteRequestPath: () => "/index.html",
  });

  app.get("*", (c, next) => (c.req.path.startsWith("/api/") ? next() : spaFallback(c, next)));
}
