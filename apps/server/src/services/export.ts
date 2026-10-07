import { type Dirent, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { MAX_OBJECT_BYTES, RESERVED_ROOT_DIRS } from "@migite/core";
import { crearZip, sanitizeZipName, type ZipEntry } from "./zip.js";

export type ExportDeps = {
  readonly vaultDir: string;
  readonly readDirectory?: (directory: string) => Dirent[];
  readonly fileSize?: (path: string) => number;
  readonly readFile?: (path: string) => Uint8Array;
  readonly warn?: (message: string) => void;
};

export const MAX_EXPORT_ENTRIES = 65_535;

export const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

export const MAX_EXPORT_FILE_BYTES = MAX_OBJECT_BYTES;

export class ExportLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportLimitError";
  }
}

const README_NAME = "README.txt";

const MARKDOWN_FILE = /\.md$/i;

const YAML_FILE = /\.ya?ml$/i;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const byName = (left: Dirent, right: Dirent): number => left.name.localeCompare(right.name);

const childPath = (relativeDir: string, name: string): string =>
  relativeDir === "" ? name : `${relativeDir}/${name}`;

const isReservedAtRoot = (relativeDir: string, name: string): boolean =>
  relativeDir === "" && (RESERVED_ROOT_DIRS as readonly string[]).includes(name);

type ExportContext = {
  readonly vaultDir: string;
  readonly entries: ZipEntry[];
  readonly readDirectory: (directory: string) => Dirent[];
  readonly fileSize: (path: string) => number;
  readonly readFile: (path: string) => Uint8Array;
  readonly warn: (message: string) => void;
  totalBytes: number;
};

const readEntries = (context: ExportContext, directory: string): Dirent[] =>
  [...context.readDirectory(directory)].sort(byName);

const listEntries = (context: ExportContext, directory: string): Dirent[] => {
  try {
    return readEntries(context, directory);
  } catch (error) {
    context.warn(`export: se omite ${directory}: no se pudo listar (${errorMessage(error)})`);
    return [];
  }
};

const addEntry = (context: ExportContext, name: string, path: string): void => {
  const entryName = sanitizeZipName(name);
  if (entryName === undefined) {
    context.warn(`export: se omite ${name}: nombre de entrada zip no válido`);
    return;
  }
  if (context.entries.length >= MAX_EXPORT_ENTRIES) {
    throw new ExportLimitError(`la exportación supera el máximo de ${MAX_EXPORT_ENTRIES} entradas`);
  }
  let size: number;
  try {
    size = context.fileSize(path);
  } catch (error) {
    context.warn(`export: se omite ${name}: no se pudo leer (${errorMessage(error)})`);
    return;
  }
  if (size > MAX_EXPORT_FILE_BYTES) {
    context.warn(`export: se omite ${name}: supera el máximo de ${MAX_EXPORT_FILE_BYTES} bytes`);
    return;
  }
  if (context.totalBytes + size > MAX_TOTAL_BYTES) {
    throw new ExportLimitError(`la exportación supera el máximo de ${MAX_TOTAL_BYTES} bytes`);
  }
  let data: Uint8Array;
  try {
    data = context.readFile(path);
  } catch (error) {
    context.warn(`export: se omite ${name}: no se pudo leer (${errorMessage(error)})`);
    return;
  }
  if (data.length > MAX_EXPORT_FILE_BYTES) {
    context.warn(`export: se omite ${name}: supera el máximo de ${MAX_EXPORT_FILE_BYTES} bytes`);
    return;
  }
  if (context.totalBytes + data.length > MAX_TOTAL_BYTES) {
    throw new ExportLimitError(`la exportación supera el máximo de ${MAX_TOTAL_BYTES} bytes`);
  }
  context.entries.push({ name: entryName, data });
  context.totalBytes += data.length;
};

const collectMarkdown = (
  context: ExportContext,
  relativeDir: string,
  entries: readonly Dirent[],
): void => {
  for (const dirent of entries) {
    const name = childPath(relativeDir, dirent.name);
    if (dirent.isDirectory()) {
      if (!isReservedAtRoot(relativeDir, dirent.name)) {
        collectMarkdown(context, name, listEntries(context, join(context.vaultDir, name)));
      }
      continue;
    }
    if (dirent.isFile() && MARKDOWN_FILE.test(dirent.name)) {
      addEntry(context, name, join(context.vaultDir, name));
    }
  }
};

const collectTipos = (context: ExportContext): void => {
  const tiposDir = join(context.vaultDir, "tipos");
  for (const dirent of listEntries(context, tiposDir)) {
    if (dirent.isFile() && YAML_FILE.test(dirent.name)) {
      addEntry(context, `tipos/${dirent.name}`, join(tiposDir, dirent.name));
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
  const context: ExportContext = {
    vaultDir: deps.vaultDir,
    entries: [{ name: README_NAME, data: readme(generatedAt) }],
    readDirectory:
      deps.readDirectory ?? ((directory) => readdirSync(directory, { withFileTypes: true })),
    fileSize: deps.fileSize ?? ((path) => statSync(path).size),
    readFile: deps.readFile ?? ((path) => readFileSync(path)),
    warn: deps.warn ?? ((message) => console.warn(message)),
    totalBytes: 0,
  };
  collectMarkdown(context, "", readEntries(context, context.vaultDir));
  collectTipos(context);
  return crearZip(context.entries);
};

export const exportFilename = (generatedAt = new Date()): string =>
  `migite-export-${generatedAt.toISOString().slice(0, 10)}.zip`;
