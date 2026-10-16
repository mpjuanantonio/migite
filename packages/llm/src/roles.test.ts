import type { LlmConfig } from "@migite/core";
import { describe, expect, it } from "vitest";
import { LlmError } from "./errors.js";
import { resolveRoleModel } from "./roles.js";

const llmConfig: LlmConfig = {
  providers: [
    {
      id: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKeyEnv: "OPENAI_API_KEY",
    },
    {
      id: "local",
      baseUrl: "http://localhost:11434/v1",
      apiKeyEnv: "LOCAL_API_KEY",
    },
  ],
  roles: {
    chat: { provider: "openai", model: "gpt-4o-mini" },
    retrieve: { provider: "local", model: "llama3.2" },
    summarize: { provider: "openai", model: "gpt-4o-mini" },
    embeddings: { provider: "openai", model: "text-embedding-3-small" },
  },
};

const incompleteConfig = {
  providers: llmConfig.providers,
  roles: {
    chat: llmConfig.roles.chat,
    retrieve: llmConfig.roles.retrieve,
    summarize: llmConfig.roles.summarize,
  },
} as unknown as LlmConfig;

const undeclaredProviderConfig = {
  providers: llmConfig.providers,
  roles: {
    ...llmConfig.roles,
    chat: { provider: "inexistente", model: "gpt-4o-mini" },
  },
} as unknown as LlmConfig;

describe("resolveRoleModel", () => {
  it("resuelve el proveedor y el modelo de un rol configurado", () => {
    expect(resolveRoleModel(llmConfig, "chat")).toEqual({
      providerId: "openai",
      model: "gpt-4o-mini",
      baseUrl: "https://api.openai.com/v1",
      apiKeyEnv: "OPENAI_API_KEY",
    });
  });

  it("permite asignar roles a proveedores distintos", () => {
    expect(resolveRoleModel(llmConfig, "retrieve")).toEqual({
      providerId: "local",
      model: "llama3.2",
      baseUrl: "http://localhost:11434/v1",
      apiKeyEnv: "LOCAL_API_KEY",
    });
  });

  it("falla con error claro si el rol no está configurado", () => {
    expect(() => resolveRoleModel(incompleteConfig, "embeddings")).toThrow(LlmError);
    expect(() => resolveRoleModel(incompleteConfig, "embeddings")).toThrow(/embeddings/);
  });

  it("falla con error claro si el proveedor del rol no está declarado", () => {
    expect(() => resolveRoleModel(undeclaredProviderConfig, "chat")).toThrow(LlmError);
    expect(() => resolveRoleModel(undeclaredProviderConfig, "chat")).toThrow(/inexistente/);
  });
});
