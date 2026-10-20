import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { type AuthOptions, createStaticSessionStore } from "./auth.js";

const auth: AuthOptions = {
  store: createStaticSessionStore({
    usuario: "tester",
    passwordHash: "$argon2id$test",
    secretoSesion: "secreto-de-test-suficientemente-largo",
  }),
};

describe("GET /api/health", () => {
  it("returns the system status without a session", async () => {
    const res = await createApp({ auth }).request("/api/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "degradado",
      indice: { objetos: 0, listo: false, ultimoError: null },
    });
  });
});

describe("body limit", () => {
  it("rejects an oversized body with a bad request", async () => {
    const res = await createApp({ auth }).request("/api/sesion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usuario: "tester", contrasena: "x".repeat(40 * 1024) }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { codigo: "bad_request", mensaje: "La petición no es válida" },
    });
  });
});
