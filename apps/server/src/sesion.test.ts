import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type IndexHandle, openIndex } from "@migite/index";
import { hash } from "@node-rs/argon2";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { type AuthOptions, createSessionToken, SESSION_COOKIE } from "./auth.js";
import type { ServerEnv } from "./env.js";
import { createIndexSessionStore } from "./session-store.js";

const USUARIO = "ana";
const CONTRASENA = "contrasena-correcta";
const SECRETO = "secreto-de-test-suficientemente-largo";
const PASSWORD_HASH = await hash(CONTRASENA, { memoryCost: 4096, timeCost: 1 });

let root: string;
let handle: IndexHandle;
let auth: AuthOptions;
let app: Hono<ServerEnv>;

const login = async (
  contrasena: string = CONTRASENA,
  usuario: string = USUARIO,
): Promise<Response> =>
  app.request("/api/sesion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario, contrasena }),
  });

const cookieFrom = (res: Response): string => {
  const header = res.headers.get("set-cookie") ?? "";
  return header.split(";")[0] ?? "";
};

const withCookie = (cookie: string): Record<string, string> => ({ cookie });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "migite-sesion-"));
  handle = openIndex({ dbPath: join(root, "index.db") });
  auth = {
    usuario: USUARIO,
    passwordHash: PASSWORD_HASH,
    secretoSesion: SECRETO,
    store: createIndexSessionStore(handle.db),
  };
  app = createApp({ auth });
});

afterEach(() => {
  handle.close();
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("POST /api/sesion", () => {
  it("logs in with the right credentials and keeps the session", async () => {
    const res = await login();

    expect(res.status).toBe(204);
    const setCookie = res.headers.get("set-cookie") ?? "";
    const cookie = cookieFrom(res);
    expect(cookie.startsWith(`${SESSION_COOKIE}=`)).toBe(true);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Max-Age=");
    expect(setCookie).not.toContain("Secure");

    const estado = await app.request("/api/sesion", { headers: withCookie(cookie) });
    expect(estado.status).toBe(200);
    expect(await estado.json()).toEqual({ autenticado: true });
  });

  it("keeps the session across app instances", async () => {
    const cookie = cookieFrom(await login());
    const reloaded = createApp({ auth });

    const estado = await reloaded.request("/api/sesion", { headers: withCookie(cookie) });
    expect(await estado.json()).toEqual({ autenticado: true });
  });

  it("answers the same generic error for a wrong password and an unknown user", async () => {
    const wrongPassword = await login("otra-contrasena");
    const unknownUser = await login(CONTRASENA, "otro");

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    const wrongBody = await wrongPassword.json();
    expect(wrongBody).toEqual(await unknownUser.json());
    expect(wrongBody).toEqual({
      error: { codigo: "unauthorized", mensaje: "Se requiere autenticación" },
    });
    expect(wrongPassword.headers.get("set-cookie")).toBeNull();
    expect(unknownUser.headers.get("set-cookie")).toBeNull();
  });

  it("rejects malformed credentials with a bad request", async () => {
    const res = await app.request("/api/sesion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usuario: "  ", contrasena: "" }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { codigo: "bad_request", mensaje: "La petición no es válida" },
    });
  });

  it("sets Secure when the request arrives over https", async () => {
    const res = await app.request("/api/sesion", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
      body: JSON.stringify({ usuario: USUARIO, contrasena: CONTRASENA }),
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toContain("Secure");
  });

  it("rate limits failed logins and recovers after the window", async () => {
    const inicio = Date.now();
    vi.useFakeTimers({ toFake: ["Date"], now: inicio });
    try {
      for (let intento = 0; intento < 5; intento += 1) {
        expect((await login("mala")).status).toBe(401);
      }

      const bloqueado = await login("mala");
      expect(bloqueado.status).toBe(429);
      expect(await bloqueado.json()).toEqual({
        error: {
          codigo: "rate_limited",
          mensaje: "Demasiados intentos. Inténtalo de nuevo más tarde",
        },
      });
      expect((await login()).status).toBe(429);

      vi.setSystemTime(new Date(inicio + 60_001));
      expect((await login()).status).toBe(204);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets the failure counter after a successful login", async () => {
    for (let intento = 0; intento < 4; intento += 1) {
      expect((await login("mala")).status).toBe(401);
    }
    expect((await login()).status).toBe(204);

    for (let intento = 0; intento < 5; intento += 1) {
      expect((await login("mala")).status).toBe(401);
    }
    expect((await login("mala")).status).toBe(429);
  });
});

describe("GET /api/sesion", () => {
  it("reports the session state without sensitive data", async () => {
    const anonymous = await app.request("/api/sesion");
    expect(anonymous.status).toBe(200);
    expect(await anonymous.json()).toEqual({ autenticado: false });

    const cookie = cookieFrom(await login());
    const authenticated = await app.request("/api/sesion", { headers: withCookie(cookie) });
    expect(await authenticated.json()).toEqual({ autenticado: true });
  });

  it("rejects tampered and expired cookies", async () => {
    const token = cookieFrom(await login()).slice(SESSION_COOKIE.length + 1);
    const tampered = `${SESSION_COOKIE}=${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    const expired = `${SESSION_COOKIE}=${createSessionToken({
      usuario: USUARIO,
      generacion: 0,
      secret: SECRETO,
      ttlMs: 1_000,
      now: Date.now() - 5_000,
    })}`;

    for (const cookie of [tampered, expired]) {
      const estado = await app.request("/api/sesion", { headers: { cookie } });
      expect(estado.status).toBe(200);
      expect(await estado.json()).toEqual({ autenticado: false });
      expect((await app.request("/api/objetos", { headers: { cookie } })).status).toBe(401);
    }
  });
});

describe("DELETE /api/sesion", () => {
  it("rejects a logout without a valid session without invalidating it", async () => {
    expect(auth.store.generacion()).toBe(0);

    const anonymous = await app.request("/api/sesion", { method: "DELETE" });
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({
      error: { codigo: "unauthorized", mensaje: "Se requiere autenticación" },
    });

    const forged = await app.request("/api/sesion", {
      method: "DELETE",
      headers: { cookie: `${SESSION_COOKIE}=falsa` },
    });
    expect(forged.status).toBe(401);

    expect(auth.store.generacion()).toBe(0);
  });

  it("invalidates every previous cookie and clears it", async () => {
    const oldCookie = cookieFrom(await login());
    expect(auth.store.generacion()).toBe(0);

    const logout = await app.request("/api/sesion", {
      method: "DELETE",
      headers: withCookie(oldCookie),
    });

    expect(logout.status).toBe(204);
    expect(auth.store.generacion()).toBe(1);
    expect(logout.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=`);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");

    const oldState = await app.request("/api/sesion", { headers: withCookie(oldCookie) });
    expect(await oldState.json()).toEqual({ autenticado: false });
    expect((await app.request("/api/objetos", { headers: withCookie(oldCookie) })).status).toBe(
      401,
    );

    const newCookie = cookieFrom(await login());
    const newState = await app.request("/api/sesion", { headers: withCookie(newCookie) });
    expect(await newState.json()).toEqual({ autenticado: true });
  });
});

describe("session middleware", () => {
  it("requires a session for protected api routes", async () => {
    for (const path of ["/api/objetos", "/api/desconocido"]) {
      const res = await app.request(path);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        error: { codigo: "unauthorized", mensaje: "Se requiere autenticación" },
      });
    }
  });

  it("keeps health and the login endpoint public", async () => {
    const health = await app.request("/api/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      status: "degradado",
      indice: { objetos: 0, listo: false, ultimoError: null },
    });

    expect((await login()).status).toBe(204);
    expect((await app.request("/api/sesion", { method: "DELETE" })).status).toBe(401);
  });

  it("never logs credentials or the session secret", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await login("contrasena-secreta-xyz");
    await login();

    const lines = log.mock.calls.map((call) => String(call[0])).join("\n");
    expect(lines).not.toContain("contrasena-secreta-xyz");
    expect(lines).not.toContain(CONTRASENA);
    expect(lines).not.toContain(PASSWORD_HASH);
    expect(lines).not.toContain(SECRETO);
  });
});
