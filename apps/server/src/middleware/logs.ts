import type { MiddlewareHandler } from "hono";
import type { ServerEnv } from "../env.js";
import { createRequestId, writeLog } from "../logs.js";

export const requestLogger: MiddlewareHandler<ServerEnv> = async (c, next) => {
  const requestId = createRequestId();
  c.set("requestId", requestId);
  const startedAt = Date.now();

  await next();

  writeLog({
    event: "request",
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: Date.now() - startedAt,
  });
};
