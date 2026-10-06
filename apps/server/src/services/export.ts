import { type Dirent, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RESERVED_ROOT_DIRS } from "@migite/core";
import { crearZip, type ZipEntry } from "./zip.js";

export type ExportDeps = {
  readonly vaultDir: string;
};

const README_NAME = "README.txt";

const MARKDOWN_FILE = /\.md$/i;

const YAML_FILE = /\.ya?ml$/i;

const byName = (left: Dirent, right: Dirent): number => left.name.localeCompare(right.name);

const listEntries = (directory: string): Dirent[] =>
  existsSync(directory) ? readdirSync(directory, { withFileTypes: true }).sort(byName) : [];

const childPath = (relativeDir: string, name: string): string =>
  relativeDir === "" ? name : `${relativeDir}/${name}`;

const isReservedAtRoot = (relativeDir: string, name: string): boolean =>
  relativeDir === "" && (RESERVED_ROOT_DIRS as readonly string[]).includes(name);

const collectMarkdown = (vaultDir: string, relativeDir: string, entries: ZipEntry[]): void => {
  const directory = relativeDir === "" ? vaultDir : join(vaultDir, relativeDir);
  for (const dirent of listEntries(directory)) {
    if (dirent.isDirectory()) {
      if (!isReservedAtRoot(relativeDir, dirent.name)) {
        collectMarkdown(vaultDir, childPath(relativeDir, dirent.name), entries);
      }
      continue;
    }
    if (dirent.isFile() && MARKDOWN_FILE.test(dirent.name)) {
      entries.push({
        name: childPath(relativeDir, dirent.name),
        data: readFileSync(join(directory, dirent.name)),
      });
    }
  }
};

const collectTipos = (vaultDir: string, entries: ZipEntry[]): void => {
  const tiposDir = join(vaultDir, "tipos");
  for (const dirent of listEntries(tiposDir)) {
    if (dirent.isFile() && YAML_FILE.test(dirent.name)) {
      entries.push({
        name: `tipos/${dirent.name}`,
        data: readFileSync(join(tiposDir, dirent.name)),
      });
    }
  }
};

const readme = (generatedAt: Date): Uint8Array =>
  new TextEncoder().encode(
    [
      "Exportación de Migite",
      "=====================",
      "",
      "Este paquete es una copia portátil de tu vault. Contiene:",
      "",
      "- Todos los objetos en Markdown (.md), manteniendo su estructura de carpetas.",
      "- La definición de tus tipos en tipos/*.yaml.",
      "- Este README que explica el contenido.",
      "",
      "Los adjuntos y las conversaciones no se incluyen en esta exportación básica;",
      "llegarán en una versión completa posterior.",
      "",
      `Generado: ${generatedAt.toISOString()}`,
      "",
    ].join("\n"),
  );

export const createExportZip = (
  deps: ExportDeps,
  generatedAt = new Date(),
): Uint8Array<ArrayBuffer> => {
  const entries: ZipEntry[] = [{ name: README_NAME, data: readme(generatedAt) }];
  collectMarkdown(deps.vaultDir, "", entries);
  collectTipos(deps.vaultDir, entries);
  return crearZip(entries);
};

export const exportFilename = (generatedAt = new Date()): string =>
  `migite-export-${generatedAt.toISOString().slice(0, 10)}.zip`;
