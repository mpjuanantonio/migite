import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TypeDefinition, TypeWarning } from "./definitions.js";
import { parseTypeDetails } from "./parse.js";

const YAML_FILE = /\.ya?ml$/i;

export const loadTypeRegistry = (
  tiposDir: string,
): { types: Map<string, TypeDefinition>; warnings: TypeWarning[] } => {
  const types = new Map<string, TypeDefinition>();
  const warnings: TypeWarning[] = [];

  let entries: Dirent[];
  try {
    entries = readdirSync(tiposDir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  } catch {
    return { types, warnings };
  }

  for (const entry of entries) {
    if (!entry.isFile() || !YAML_FILE.test(entry.name)) {
      continue;
    }

    const path = join(tiposDir, entry.name);
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      warnings.push({ path, problems: ["unreadable file"] });
      continue;
    }

    const details = parseTypeDetails(text);
    if (details.definition === null) {
      warnings.push({ path, problems: [...details.fileProblems] });
      continue;
    }

    const definition = details.definition;
    if (types.has(definition.id)) {
      warnings.push({
        path,
        problems: [`duplicate type id "${definition.id}", first definition kept`],
      });
      continue;
    }
    types.set(definition.id, definition);

    if (details.fileProblems.length > 0) {
      warnings.push({ path, problems: [...details.fileProblems] });
    }
    for (const attribute of details.attributeWarnings) {
      warnings.push({
        path,
        problems: attribute.problems.map((problem) => `attribute "${attribute.id}": ${problem}`),
      });
    }
  }

  return { types, warnings };
};
