import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import {
  type AuthOptions,
  createSessionToken,
  DEFAULT_SESSION_TTL_MS,
  SESSION_COOKIE,
  verifySessionToken,
} from "../auth.js";
import type { ServerEnv } from "../env.js";

export const sessionTtlMs = (auth: AuthOptions): number => auth.ttlMs ?? DEFAULT_SESSION_TTL_MS;

const forcesSecureCookies = (): boolean => process.env.MIGITE_SECURE_COOKIES === "1";

const isSecureRequest = (c: Context<ServerEnv>): boolean => {
  if (forcesSecureCookies() || new URL(c.req.url).protocol === "https:") {
    return true;
  }
  const forwarded = c.req.header("x-forwarded-proto");
  return forwarded?.split(",")[0]?.trim().toLowerCase() === "https";
};

export const hasValidSession = (c: Context<ServerEnv>, auth: AuthOptions): boolean => {
  const credentials = auth.store.credenciales();
  if (credentials === undefined) {
    return false;
  }
  const token = getCookie(c, SESSION_COOKIE);
  return (
    verifySessionToken(token, {
      secret: auth.store.secretoSesion,
      generacion: auth.store.generacion(),
      usuario: credentials.usuario,
    }) !== undefined
  );
};

export const setSessionCookie = (c: Context<ServerEnv>, auth: AuthOptions): void => {
  const credentials = auth.store.credenciales();
  if (credentials === undefined) {
    throw new HTTPException(500);
  }
  const ttlMs = sessionTtlMs(auth);
  const token = createSessionToken({
    usuario: credentials.usuario,
    generacion: auth.store.generacion(),
    secret: auth.store.secretoSesion,
    ttlMs,
  });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Strict",
    secure: isSecureRequest(c),
    path: "/",
    maxAge: Math.floor(ttlMs / 1000),
  });
};

export const clearSessionCookie = (c: Context<ServerEnv>): void => {
  deleteCookie(c, SESSION_COOKIE, {
    path: "/",
    httpOnly: true,
    sameSite: "Strict",
    secure: isSecureRequest(c),
  });
};

export const requireSession = (auth: AuthOptions): MiddlewareHandler<ServerEnv> => {
  return async (c, next) => {
    if (!hasValidSession(c, auth)) {
      throw new HTTPException(401);
    }
    await next();
  };
};
