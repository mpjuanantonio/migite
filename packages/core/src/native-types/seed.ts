import {
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { t } from "../i18n/index.js";
import { writeFileAtomic } from "../objects/atomic.js";
import { NATIVE_TYPE_IDS, NATIVE_TYPE_YAML, RECORDATORIO_YAML_ANTERIOR } from "./definitions.js";

export interface SeedNativeTypesResult {
  readonly created: string[];
  readonly skipped: string[];
  readonly upgraded: string[];
}

const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;

const errorDetail = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const run = (problems: string[], path: string, action: () => void): boolean => {
  try {
    action();
    return true;
  } catch (error) {
    problems.push(`${path}: ${errorDetail(error)}`);
    return false;
  }
};

const readRegularFile = (path: string): string | undefined => {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    const code = errorCode(error);
    if (code === "ELOOP" || code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  try {
    if (!fstatSync(fd).isFile()) {
      return undefined;
    }
    return readFileSync(fd, "utf8");
  } finally {
    closeSync(fd);
  }
};

const migrateRecordatorio = (path: string): "skipped" | "upgraded" => {
  if (readRegularFile(path) !== RECORDATORIO_YAML_ANTERIOR) {
    return "skipped";
  }
  writeFileAtomic(path, NATIVE_TYPE_YAML.recordatorio);
  return "upgraded";
};

export const seedNativeTypes = (tiposDir: string): SeedNativeTypesResult => {
  const created: string[] = [];
  const skipped: string[] = [];
  const upgraded: string[] = [];
  const problems: string[] = [];

  if (run(problems, tiposDir, () => mkdirSync(tiposDir, { recursive: true }))) {
    for (const id of NATIVE_TYPE_IDS) {
      const path = join(tiposDir, `${id}.yaml`);
      try {
        writeFileSync(path, NATIVE_TYPE_YAML[id], { encoding: "utf8", flag: "wx" });
        created.push(id);
      } catch (error) {
        if (errorCode(error) !== "EEXIST") {
          problems.push(`${path}: ${errorDetail(error)}`);
          continue;
        }
        if (id !== "recordatorio") {
          skipped.push(id);
          continue;
        }
        try {
          const action = migrateRecordatorio(path);
          if (action === "upgraded") {
            upgraded.push(id);
          } else {
            skipped.push(id);
          }
        } catch (migrationError) {
          problems.push(`${path}: ${errorDetail(migrationError)}`);
        }
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(t("error.typeSeedFailed", { path: tiposDir, problems: problems.join("; ") }));
  }
  return { created, skipped, upgraded };
};
