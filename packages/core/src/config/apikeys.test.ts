import { describe, expect, it } from "vitest";
import { missingApiKeys } from "./apikeys.js";
import type { LlmConfig } from "./schema.js";

const llmWith = (...apiKeyEnvs: readonly string[]): LlmConfig => ({
  providers: apiKeyEnvs.map((apiKeyEnv, index) => ({
    id: `prov-${index}`,
    baseUrl: "https://api.example.com/v1",
    apiKeyEnv,
  })),
  roles: {
    chat: { provider: "prov-0", model: "gpt-4o-mini" },
    retrieve: { provider: "prov-0", model: "gpt-4o-mini" },
    summarize: { provider: "prov-0", model: "gpt-4o-mini" },
    embeddings: { provider: "prov-0", model: "gpt-4o-mini" },
  },
});

describe("missingApiKeys", () => {
  it("returns the name of the variable that is not defined", () => {
    expect(missingApiKeys(llmWith("OPENAI_API_KEY"), {})).toEqual(["OPENAI_API_KEY"]);
  });

  it("returns nothing when the variable is defined", () => {
    const env = { OPENAI_API_KEY: "sk-definida" };

    expect(missingApiKeys(llmWith("OPENAI_API_KEY"), env)).toEqual([]);
  });

  it("treats an empty or blank variable as missing", () => {
    expect(missingApiKeys(llmWith("OPENAI_API_KEY"), { OPENAI_API_KEY: "" })).toEqual([
      "OPENAI_API_KEY",
    ]);
    expect(missingApiKeys(llmWith("OPENAI_API_KEY"), { OPENAI_API_KEY: "   " })).toEqual([
      "OPENAI_API_KEY",
    ]);
  });

  it("deduplicates providers that share the same variable", () => {
    const llm = llmWith("OPENAI_API_KEY", "OPENAI_API_KEY");

    expect(missingApiKeys(llm, {})).toEqual(["OPENAI_API_KEY"]);
  });

  it("returns only names, never environment values", () => {
    const env = { OTHER_VAR: "sk-secreto-que-no-debe-saltar" };

    const missing = missingApiKeys(llmWith("OPENAI_API_KEY"), env);

    expect(missing).toEqual(["OPENAI_API_KEY"]);
    expect(missing.join(" ")).not.toContain("sk-secreto-que-no-debe-saltar");
  });
});
