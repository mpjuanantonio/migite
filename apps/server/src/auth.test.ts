import { ConfigError } from "@migite/core";
import { hash } from "@node-rs/argon2";
import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  loadAuthConfig,
  verifyCredentials,
  verifySessionToken,
} from "./auth.js";

const SECRET = "secreto-de-test-suficientemente-largo";
const NOW = 1_700_000_000_000;
const VERIFY_OPTIONS = { secret: SECRET, generacion: 3, usuario: "ana" };

const validEnv = {
  MIGITE_USER: "ana",
  MIGITE_PASSWORD_HASH: "$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$abcdef",
  MIGITE_SESSION_SECRET: SECRET,
};

const PASSWORD_HASH = await hash("correcta", { memoryCost: 4096, timeCost: 1 });

const captureConfigError = (env: Readonly<Record<string, string | undefined>>): ConfigError => {
  try {
    loadAuthConfig("es", env);
  } catch (error) {
    if (error instanceof ConfigError) {
      return error;
    }
    throw error;
  }
  throw new Error("se esperaba un ConfigError");
};

describe("createSessionToken / verifySessionToken", () => {
  it("round-trips a valid token", () => {
    const token = createSessionToken({
      usuario: "ana",
      generacion: 3,
      secret: SECRET,
      ttlMs: 60_000,
      now: NOW,
    });

    expect(verifySessionToken(token, { ...VERIFY_OPTIONS, now: NOW + 1 })).toEqual({
      usuario: "ana",
      generacion: 3,
      expiraEn: NOW + 60_000,
    });
  });

  it("rejects a tampered signature", () => {
    const token = createSessionToken({ ...VERIFY_OPTIONS, secret: SECRET, now: NOW });
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

    expect(verifySessionToken(tampered, { ...VERIFY_OPTIONS, now: NOW })).toBeUndefined();
  });

  it("rejects a token signed with another secret", () => {
    const token = createSessionToken({
      usuario: "ana",
      generacion: 3,
      secret: "otro-secreto-suficientemente-largo-para-la-firma",
      now: NOW,
    });

    expect(verifySessionToken(token, { ...VERIFY_OPTIONS, now: NOW })).toBeUndefined();
  });

  it("rejects an expired token", () => {
    const token = createSessionToken({
      usuario: "ana",
      generacion: 3,
      secret: SECRET,
      ttlMs: 1_000,
      now: NOW,
    });

    expect(verifySessionToken(token, { ...VERIFY_OPTIONS, now: NOW + 1_000 })).toBeUndefined();
  });

  it("rejects a token from a previous generation", () => {
    const token = createSessionToken({ usuario: "ana", generacion: 2, secret: SECRET, now: NOW });

    expect(verifySessionToken(token, { ...VERIFY_OPTIONS, now: NOW })).toBeUndefined();
  });

  it("rejects a token from another user", () => {
    const token = createSessionToken({ usuario: "otra", generacion: 3, secret: SECRET, now: NOW });

    expect(verifySessionToken(token, { ...VERIFY_OPTIONS, now: NOW })).toBeUndefined();
  });

  it("rejects missing or malformed tokens", () => {
    for (const token of [undefined, "", "a", "a.b", "v2.x.y", "v1..firma", "v1.payload."]) {
      expect(verifySessionToken(token, { ...VERIFY_OPTIONS, now: NOW })).toBeUndefined();
    }
  });
});

describe("loadAuthConfig", () => {
  it("loads and trims the env credentials when the whole pair is present", () => {
    expect(loadAuthConfig("es", { ...validEnv, MIGITE_USER: "  ana  " })).toEqual({
      credentials: { usuario: "ana", passwordHash: validEnv.MIGITE_PASSWORD_HASH },
      secretoSesion: SECRET,
    });
  });

  it("falls back to setup mode when no env credentials are present", () => {
    expect(loadAuthConfig("es", {})).toEqual({});
    expect(loadAuthConfig("es", { MIGITE_SESSION_SECRET: undefined })).toEqual({});
  });

  it("does not require a session secret anymore", () => {
    const envSinSecreto = { ...validEnv, MIGITE_SESSION_SECRET: undefined };

    expect(loadAuthConfig("es", envSinSecreto)).toEqual({
      credentials: { usuario: "ana", passwordHash: validEnv.MIGITE_PASSWORD_HASH },
    });
  });

  it("rejects a half-configured env credential pair", () => {
    for (const name of ["MIGITE_USER", "MIGITE_PASSWORD_HASH"]) {
      const env = { ...validEnv, [name]: undefined };
      const error = captureConfigError(env);
      expect(error.path).toBe(".env");
      expect(error.message).toContain(name);
    }
  });

  it("rejects a plain password where an argon2 hash is expected", () => {
    const error = captureConfigError({ ...validEnv, MIGITE_PASSWORD_HASH: "mi-contrasena" });

    expect(error.message).toContain("MIGITE_PASSWORD_HASH");
    expect(error.message).toContain("argon2");
    expect(error.message).not.toContain("mi-contrasena");
  });

  it("rejects a short session secret without echoing its value", () => {
    const error = captureConfigError({ ...validEnv, MIGITE_SESSION_SECRET: "corto" });

    expect(error.message).toContain("MIGITE_SESSION_SECRET");
    expect(error.message).toContain("32");
    expect(error.message).not.toContain("corto");
  });

  it("rejects a long but low-entropy session secret without echoing its value", () => {
    const debil = "a".repeat(32);
    const error = captureConfigError({ ...validEnv, MIGITE_SESSION_SECRET: debil });

    expect(error.message).toContain("MIGITE_SESSION_SECRET");
    expect(error.message).toContain("16");
    expect(error.message).not.toContain(debil);
  });

  it("rejects a repeated-pattern session secret without echoing its value", () => {
    const repetido = "abcdefghijklmnop".repeat(2);
    const error = captureConfigError({ ...validEnv, MIGITE_SESSION_SECRET: repetido });

    expect(error.message).toContain("MIGITE_SESSION_SECRET");
    expect(error.message).toContain("patrón");
    expect(error.message).not.toContain(repetido);
  });

  it("accepts a high-entropy session secret", () => {
    const fuerte = "0123456789abcdefghijklmnopqrstuvwxyzABCDEF";

    expect(loadAuthConfig("es", { ...validEnv, MIGITE_SESSION_SECRET: fuerte })).toEqual({
      credentials: { usuario: "ana", passwordHash: validEnv.MIGITE_PASSWORD_HASH },
      secretoSesion: fuerte,
    });
  });
});

describe("verifyCredentials", () => {
  it("accepts the configured user with the right password", async () => {
    expect(
      await verifyCredentials(
        { usuario: "ana", passwordHash: PASSWORD_HASH },
        {
          usuario: "ana",
          contrasena: "correcta",
        },
      ),
    ).toBe(true);
  });

  it("rejects a wrong password", async () => {
    expect(
      await verifyCredentials(
        { usuario: "ana", passwordHash: PASSWORD_HASH },
        {
          usuario: "ana",
          contrasena: "incorrecta",
        },
      ),
    ).toBe(false);
  });

  it("rejects another user even with the right password", async () => {
    expect(
      await verifyCredentials(
        { usuario: "ana", passwordHash: PASSWORD_HASH },
        {
          usuario: "otra",
          contrasena: "correcta",
        },
      ),
    ).toBe(false);
  });

  it("fails closed when the stored hash is invalid", async () => {
    expect(
      await verifyCredentials(
        { usuario: "ana", passwordHash: "$argon2id$invalido" },
        {
          usuario: "ana",
          contrasena: "correcta",
        },
      ),
    ).toBe(false);
  });
});
