import { getConnInfo } from "@hono/node-server/conninfo";
import { sesionStatusSchema } from "@migite/contracts";
import { defaultLocale, type Locale, t } from "@migite/core";
import { hash } from "@node-rs/argon2";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  type AuthCredentials,
  type AuthOptions,
  type Credentials,
  verifyCredentials,
} from "../auth.js";
import type { ServerEnv } from "../env.js";
import { resolveLocale } from "../middleware/errors.js";
import { clearSessionCookie, hasValidSession, setSessionCookie } from "../middleware/session.js";

const MAX_FALLOS_LOGIN = 5;
const VENTANA_LOGIN_MS = 60_000;
const MIN_CONTRASENA_LENGTH = 8;

type FallosIp = {
  intentos: number;
  expiraEn: number;
};

const createLoginRateLimiter = () => {
  const fallos = new Map<string, FallosIp>();

  const vigente = (ip: string, ahora: number): FallosIp | undefined => {
    const registro = fallos.get(ip);
    if (registro === undefined) {
      return undefined;
    }
    if (registro.expiraEn <= ahora) {
      fallos.delete(ip);
      return undefined;
    }
    return registro;
  };

  return {
    bloqueado: (ip: string): boolean =>
      (vigente(ip, Date.now())?.intentos ?? 0) >= MAX_FALLOS_LOGIN,
    registrarFallo: (ip: string): void => {
      const ahora = Date.now();
      const registro = vigente(ip, ahora);
      if (registro === undefined) {
        fallos.set(ip, { intentos: 1, expiraEn: ahora + VENTANA_LOGIN_MS });
        return;
      }
      registro.intentos += 1;
    },
    reiniciar: (ip: string): void => {
      fallos.delete(ip);
    },
  };
};

const clientIp = (c: Context<ServerEnv>): string => {
  try {
    return getConnInfo(c).remote.address ?? "local";
  } catch {
    return "local";
  }
};

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

const readSetupRequest = async (c: Context<ServerEnv>): Promise<Credentials | undefined> => {
  const credentials = await readCredentials(c);
  if (credentials === undefined || credentials.contrasena.length < MIN_CONTRASENA_LENGTH) {
    return undefined;
  }
  return credentials;
};

export type SesionRouterOptions = {
  readonly locale?: Locale;
};

export const createSesionRouter = (
  auth: AuthOptions,
  options: SesionRouterOptions = {},
): Hono<ServerEnv> => {
  const router = new Hono<ServerEnv>();
  const limiter = createLoginRateLimiter();
  const fallbackLocale = options.locale ?? defaultLocale;

  const localeOf = (c: Context<ServerEnv>): Locale =>
    resolveLocale(c.req.header("accept-language"), fallbackLocale);

  const credencialesActuales = (): AuthCredentials | undefined => auth.store.credenciales();

  const rateLimited = (c: Context<ServerEnv>): Response =>
    c.json(
      {
        error: {
          codigo: "rate_limited",
          mensaje: t("error.rateLimited", undefined, localeOf(c)),
        },
      },
      429,
    );

  router.post("/setup", async (c) => {
    const ip = clientIp(c);
    if (limiter.bloqueado(ip)) {
      return rateLimited(c);
    }
    if (credencialesActuales() !== undefined) {
      throw new HTTPException(403);
    }
    const setup = await readSetupRequest(c);
    if (setup === undefined) {
      limiter.registrarFallo(ip);
      throw new HTTPException(400);
    }
    const passwordHash = await hash(setup.contrasena);
    auth.store.definirCredenciales({ usuario: setup.usuario, passwordHash });
    limiter.reiniciar(ip);
    setSessionCookie(c, auth);
    return c.body(null, 204);
  });

  router.post("/", async (c) => {
    const ip = clientIp(c);
    if (limiter.bloqueado(ip)) {
      return rateLimited(c);
    }
    const credentials = await readCredentials(c);
    if (credentials === undefined) {
      throw new HTTPException(400);
    }
    const actuales = credencialesActuales();
    if (actuales === undefined || !(await verifyCredentials(actuales, credentials))) {
      limiter.registrarFallo(ip);
      throw new HTTPException(401);
    }
    limiter.reiniciar(ip);
    setSessionCookie(c, auth);
    return c.body(null, 204);
  });

  router.delete("/", (c) => {
    if (!hasValidSession(c, auth)) {
      throw new HTTPException(401);
    }
    auth.store.invalidar();
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  router.get("/", (c) =>
    c.json(
      sesionStatusSchema.parse({
        autenticado: hasValidSession(c, auth),
        setupRequerido: credencialesActuales() === undefined,
      }),
    ),
  );

  return router;
};
