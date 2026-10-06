import type { LlmConfig } from "./schema.js";

export const missingApiKeys = (
  llm: LlmConfig,
  env: Readonly<Record<string, string | undefined>> = process.env,
): readonly string[] => {
  const seen = new Set<string>();
  const missing: string[] = [];

  for (const provider of llm.providers) {
    const name = provider.apiKeyEnv;
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    const value = env[name];
    if (value === undefined || value.trim() === "") {
      missing.push(name);
    }
  }

  return missing;
};
