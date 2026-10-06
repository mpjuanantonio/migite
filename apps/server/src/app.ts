import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Locale } from "@migite/core";
import { Hono } from "hono";
import type { AuthOptions } from "./auth.js";
import type { ServerEnv } from "./env.js";
import { registerErrorHandling } from "./middleware/errors.js";
import { requestLogger } from "./middleware/logs.js";
import { requireSession } from "./middleware/session.js";
import { buscarRouter } from "./routes/buscar.js";
import { exportRouter } from "./routes/export.js";
import { healthRouter } from "./routes/health.js";
import { mantenimientoRouter } from "./routes/mantenimiento.js";
import { objetosRouter } from "./routes/objetos.js";
import { createSesionRouter } from "./routes/sesion.js";
import { tiposRouter } from "./routes/tipos.js";

const webDist = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "dist");

const isPublicApiPath = (path: string): boolean =>
  path === "/api/health" ||
  path === "/api/health/" ||
  path === "/api/sesion" ||
  path.startsWith("/api/sesion/");

export type CreateAppOptions = {
  readonly locale?: Locale;
  readonly auth: AuthOptions;
};

export const createApp = (options: CreateAppOptions): Hono<ServerEnv> => {
  const app = new Hono<ServerEnv>();
  const protectApi = requireSession(options.auth);

  app.use("*", requestLogger);
  registerErrorHandling(app, { fallbackLocale: options.locale });

  app.use("/api/*", async (c, next) => {
    if (isPublicApiPath(c.req.path)) {
      await next();
      return;
    }
    await protectApi(c, next);
  });

  app.route("/api/health", healthRouter);
  app.route("/api/sesion", createSesionRouter(options.auth));

  app.route("/api/objetos", objetosRouter);
  app.route("/api/tipos", tiposRouter);
  app.route("/api/buscar", buscarRouter);
  app.route("/api/export", exportRouter);
  app.route("/api/mantenimiento", mantenimientoRouter);

  if (existsSync(webDist)) {
    app.use("*", serveStatic({ root: webDist }));

    const spaFallback = serveStatic({
      root: webDist,
      rewriteRequestPath: () => "/index.html",
    });

    app.get("*", (c, next) => (c.req.path.startsWith("/api/") ? next() : spaFallback(c, next)));
  }

  return app;
};
