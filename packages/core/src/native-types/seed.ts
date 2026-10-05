import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { t } from "../i18n/index.js";
import { NATIVE_TYPE_IDS, NATIVE_TYPE_YAML } from "./definitions.js";

export interface SeedNativeTypesResult {
  readonly created: string[];
  readonly skipped: string[];
}

const run = (problems: string[], path: string, action: () => void): boolean => {
  try {
    action();
    return true;
  } catch (error) {
    problems.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
};

export const seedNativeTypes = (tiposDir: string): SeedNativeTypesResult => {
  const created: string[] = [];
  const skipped: string[] = [];
  const problems: string[] = [];

  if (run(problems, tiposDir, () => mkdirSync(tiposDir, { recursive: true }))) {
    for (const id of NATIVE_TYPE_IDS) {
      const path = join(tiposDir, `${id}.yaml`);
      if (existsSync(path)) {
        skipped.push(id);
        continue;
      }
      if (run(problems, path, () => writeFileSync(path, NATIVE_TYPE_YAML[id], "utf8"))) {
        created.push(id);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(t("error.typeSeedFailed", { path: tiposDir, problems: problems.join("; ") }));
  }
  return { created, skipped };
};
