import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { AuthOptions } from "./auth.js";

const auth: AuthOptions = {
  usuario: "tester",
  passwordHash: "$argon2id$test",
  secretoSesion: "secreto-de-test-suficientemente-largo",
  store: { generacion: () => 0, invalidar: () => 1 },
};

describe("GET /api/health", () => {
  it("returns the system status without a session", async () => {
    const res = await createApp({ auth }).request("/api/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
