import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { type AuthOptions, type Credentials, verifyCredentials } from "../auth.js";
import type { ServerEnv } from "../env.js";
import { clearSessionCookie, hasValidSession, setSessionCookie } from "../middleware/session.js";

const readCredentials = async (c: Context<ServerEnv>): Promise<Credentials | undefined> => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return undefined;
  }
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const { usuario, contrasena } = body as Record<string, unknown>;
  if (typeof usuario !== "string" || typeof contrasena !== "string") {
    return undefined;
  }
  const trimmedUser = usuario.trim();
  if (trimmedUser.length === 0 || contrasena.length === 0) {
    return undefined;
  }
  return { usuario: trimmedUser, contrasena };
};

export const createSesionRouter = (auth: AuthOptions): Hono<ServerEnv> => {
  const router = new Hono<ServerEnv>();

  router.post("/", async (c) => {
    const credentials = await readCredentials(c);
    if (credentials === undefined) {
      throw new HTTPException(400);
    }
    if (!(await verifyCredentials(auth, credentials))) {
      throw new HTTPException(401);
    }
    setSessionCookie(c, auth);
    return c.body(null, 204);
  });

  router.delete("/", (c) => {
    auth.store.invalidar();
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  router.get("/", (c) => c.json({ autenticado: hasValidSession(c, auth) }));

  return router;
};
