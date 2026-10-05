import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

export const app = new Hono();

app.get("/api/health", (c) => c.json({ status: "ok" }));

const webDist = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "dist");

if (existsSync(webDist)) {
  app.use("*", serveStatic({ root: webDist }));

  const spaFallback = serveStatic({
    root: webDist,
    rewriteRequestPath: () => "/index.html",
  });

  app.get("*", (c, next) => (c.req.path.startsWith("/api/") ? next() : spaFallback(c, next)));
}
