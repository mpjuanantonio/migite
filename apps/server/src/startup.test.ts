import type { Config } from "@migite/core";
import { describe, expect, it } from "vitest";
import { resolvePort, serverErrorMessage, startupWarnings } from "./startup.js";

const configWithApiKey = (apiKeyEnv: string, locale: "es" | "en" = "es"): Config => ({
  app: {
    paths: { vault: "./vault", index: "./data/index.db" },
    timeZone: "Europe/Madrid",
    locale,
  },
  llm: {
    providers: [{ id: "openai", baseUrl: "https://api.openai.com/v1", apiKeyEnv }],
    roles: {
      chat: { provider: "openai", model: "gpt-4o-mini" },
      retrieve: { provider: "openai", model: "gpt-4o-mini" },
      summarize: { provider: "openai", model: "gpt-4o-mini" },
      embeddings: { provider: "openai", model: "text-embedding-3-small" },
    },
  },
  envVars: [],
});

describe("resolvePort", () => {
  it("falls back to 3000 when PORT is not defined", () => {
    expect(resolvePort(undefined)).toBe(3000);
  });

  it("accepts an integer within the range", () => {
    expect(resolvePort("3000")).toBe(3000);
    expect(resolvePort("1")).toBe(1);
    expect(resolvePort("65535")).toBe(65535);
    expect(resolvePort(" 4000 ")).toBe(4000);
  });

  it("rejects a non numeric value with a clear error", () => {
    expect(() => resolvePort("abc")).toThrow("PORT inválido");
    expect(() => resolvePort("abc")).toThrow("entre 1 y 65535");
  });

  it("rejects an empty value instead of opening a random port", () => {
    expect(() => resolvePort("")).toThrow("PORT inválido");
  });

  it("rejects integers out of range or non integers", () => {
    expect(() => resolvePort("0")).toThrow("PORT inválido");
    expect(() => resolvePort("65536")).toThrow("PORT inválido");
    expect(() => resolvePort("8080.5")).toThrow("PORT inválido");
    expect(() => resolvePort("-1")).toThrow("PORT inválido");
  });
});

describe("serverErrorMessage", () => {
  it("turns EADDRINUSE into a clear message without the stack", () => {
    const error = Object.assign(new Error("listen EADDRINUSE: address in use :::3000"), {
      code: "EADDRINUSE",
    });

    const message = serverErrorMessage(error);

    expect(message).toBe("No se pudo iniciar el servidor: el puerto ya está en uso (EADDRINUSE)");
    expect(message).not.toContain("\n");
  });

  it("describes EACCES with a clear message", () => {
    const error = Object.assign(new Error("listen EACCES: permission denied"), { code: "EACCES" });

    expect(serverErrorMessage(error)).toBe(
      "No se pudo iniciar el servidor: no hay permisos para escuchar en el puerto (EACCES)",
    );
  });

  it("uses the error message when the code is not mapped", () => {
    expect(serverErrorMessage(new Error("fallo cualquiera"))).toBe(
      "No se pudo iniciar el servidor: fallo cualquiera",
    );
    expect(serverErrorMessage("fallo raro")).toBe("No se pudo iniciar el servidor: fallo raro");
  });
});

describe("startupWarnings", () => {
  it("warns with the variable name when the API key is missing", () => {
    const warnings = startupWarnings(configWithApiKey("OPENAI_API_KEY"), {});

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("OPENAI_API_KEY");
    expect(warnings[0]).toContain("agente de IA");
  });

  it("emits no warning when the key is defined", () => {
    const warnings = startupWarnings(configWithApiKey("OPENAI_API_KEY"), {
      OPENAI_API_KEY: "sk-secreto",
    });

    expect(warnings).toEqual([]);
  });

  it("never reflects environment values in the warning", () => {
    const warnings = startupWarnings(configWithApiKey("OPENAI_API_KEY"), {
      OTHER_VAR: "sk-otro-secreto",
    });

    expect(warnings.join(" ")).toContain("OPENAI_API_KEY");
    expect(warnings.join(" ")).not.toContain("sk-otro-secreto");
  });

  it("localizes the warning with the configured locale", () => {
    const inEnglish = startupWarnings(configWithApiKey("OPENAI_API_KEY", "en"), {});

    expect(inEnglish[0]).toContain("Warning");
    expect(inEnglish[0]).toContain("OPENAI_API_KEY");
  });
});
