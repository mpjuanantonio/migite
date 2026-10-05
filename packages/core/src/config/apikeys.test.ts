import { describe, expect, it } from "vitest";
import { clavesApiAusentes } from "./apikeys.js";
import type { LlmConfig } from "./schema.js";

const llmCon = (...apiKeyEnvs: readonly string[]): LlmConfig => ({
  proveedores: apiKeyEnvs.map((apiKeyEnv, indice) => ({
    id: `prov-${indice}`,
    baseUrl: "https://api.example.com/v1",
    apiKeyEnv,
  })),
  roles: {
    conversar: { proveedor: "prov-0", modelo: "gpt-4o-mini" },
    recuperar: { proveedor: "prov-0", modelo: "gpt-4o-mini" },
    resumir: { proveedor: "prov-0", modelo: "gpt-4o-mini" },
    embeddings: { proveedor: "prov-0", modelo: "gpt-4o-mini" },
  },
});

describe("clavesApiAusentes", () => {
  it("devuelve el nombre de la variable que no está definida", () => {
    expect(clavesApiAusentes(llmCon("OPENAI_API_KEY"), {})).toEqual(["OPENAI_API_KEY"]);
  });

  it("devuelve vacío si la variable está definida", () => {
    const env = { OPENAI_API_KEY: "sk-definida" };

    expect(clavesApiAusentes(llmCon("OPENAI_API_KEY"), env)).toEqual([]);
  });

  it("trata una variable vacía o en blanco como ausente", () => {
    expect(clavesApiAusentes(llmCon("OPENAI_API_KEY"), { OPENAI_API_KEY: "" })).toEqual([
      "OPENAI_API_KEY",
    ]);
    expect(clavesApiAusentes(llmCon("OPENAI_API_KEY"), { OPENAI_API_KEY: "   " })).toEqual([
      "OPENAI_API_KEY",
    ]);
  });

  it("deduplica proveedores que comparten la misma variable", () => {
    const llm = llmCon("OPENAI_API_KEY", "OPENAI_API_KEY");

    expect(clavesApiAusentes(llm, {})).toEqual(["OPENAI_API_KEY"]);
  });

  it("devuelve solo nombres, nunca valores del entorno", () => {
    const env = { OTRA_VAR: "sk-secreto-que-no-debe-saltar" };

    const ausentes = clavesApiAusentes(llmCon("OPENAI_API_KEY"), env);

    expect(ausentes).toEqual(["OPENAI_API_KEY"]);
    expect(ausentes.join(" ")).not.toContain("sk-secreto-que-no-debe-saltar");
  });
});
