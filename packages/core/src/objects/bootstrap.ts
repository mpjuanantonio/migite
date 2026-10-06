import { join } from "node:path";
import { type SeedNativeTypesResult, seedNativeTypes } from "../native-types/seed.js";
import { loadTypeRegistry, type TypeDefinition, type TypeWarning } from "../types/index.js";
import type { VaultBootstrap } from "./model.js";

export const bootstrapVault = (vaultDir: string): VaultBootstrap => {
  const tiposDir = join(vaultDir, "tipos");
  const seed: SeedNativeTypesResult = seedNativeTypes(tiposDir);
  const registry = loadTypeRegistry(tiposDir);
  const types: TypeDefinition[] = [...registry.types.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const warnings: TypeWarning[] = registry.warnings;
  return { seed, types, warnings };
};
