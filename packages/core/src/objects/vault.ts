import { type Dirent, lstatSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { MAX_TEXT_FILE_BYTES } from "../limits.js";

export const RESERVED_ROOT_DIRS = ["tipos", "vistas", "adjuntos", ".migite"] as const;

export const MAX_OBJECT_BYTES = MAX_TEXT_FILE_BYTES;

const MARKDOWN_FILE = /\.md$/i;

export type VaultFile = {
  absolutePath: string;
  relativePath: string;
  folder: string;
  fileName: string;
};

export type FolderResult = { ok: true; folder: string } | { ok: false; problem: string };

const isReservedRoot = (name: string): boolean =>
  (RESERVED_ROOT_DIRS as readonly string[]).includes(name);

const toPosix = (value: string): string => value.replaceAll("\\", "/");

const escapesRoot = (root: string, absolutePath: string): boolean => {
  const rel = relative(root, absolutePath);
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
};

const isVaultPath = (root: string, absolutePath: string, kind: "file" | "directory"): boolean => {
  const rel = relative(root, absolutePath);
  if (rel === "") {
    return kind === "directory";
  }
  if (escapesRoot(root, absolutePath)) {
    return false;
  }
  const parts = rel.split(sep);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    let stats: ReturnType<typeof lstatSync>;
    try {
      stats = lstatSync(current);
    } catch {
      return false;
    }
    if (stats.isSymbolicLink()) {
      return false;
    }
    const isLast = index === parts.length - 1;
    if (isLast) {
      if (kind === "file" ? !stats.isFile() : !stats.isDirectory()) {
        return false;
      }
    } else if (!stats.isDirectory()) {
      return false;
    }
  }
  return true;
};

const isRegularFile = (root: string, path: string): boolean => isVaultPath(root, path, "file");

export const isVaultDirectory = (root: string, path: string): boolean =>
  isVaultPath(root, path, "directory");

const pathExists = (path: string): boolean => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

export const deepestExistingAncestor = (path: string): string => {
  let current = path;
  while (!pathExists(current)) {
    const parent = dirname(current);
    if (parent === current) {
      return current;
    }
    current = parent;
  }
  return current;
};

export const ensureVaultDirectory = (root: string, path: string): boolean => {
  if (!isVaultDirectory(root, deepestExistingAncestor(path))) {
    return false;
  }
  mkdirSync(path, { recursive: true });
  return isVaultDirectory(root, path);
};

export const readObjectText = (absolutePath: string): string => {
  const { size } = statSync(absolutePath);
  if (size > MAX_OBJECT_BYTES) {
    throw new Error(`object file exceeds the ${MAX_OBJECT_BYTES} byte read limit`);
  }
  return readFileSync(absolutePath, "utf8");
};

const relativeSegments = (relativePath: string): string[] =>
  relativePath.split("/").filter((segment) => segment !== "" && segment !== ".");

export const folderOf = (relativePath: string): string => {
  const cut = relativePath.lastIndexOf("/");
  return cut === -1 ? "" : relativePath.slice(0, cut);
};

const toVaultFile = (root: string, absolutePath: string): VaultFile => {
  const relativePath = toPosix(relative(root, absolutePath));
  const cut = relativePath.lastIndexOf("/");
  return {
    absolutePath,
    relativePath,
    folder: folderOf(relativePath),
    fileName: cut === -1 ? relativePath : relativePath.slice(cut + 1),
  };
};

const walk = (root: string, dir: string, files: VaultFile[]): void => {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir === root && isReservedRoot(entry.name)) {
        continue;
      }
      walk(root, path, files);
      continue;
    }
    if (entry.isFile() && MARKDOWN_FILE.test(entry.name)) {
      files.push(toVaultFile(root, path));
    }
  }
};

export const scanVaultFiles = (root: string): VaultFile[] => {
  const files: VaultFile[] = [];
  walk(root, root, files);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
};

export const normalizeFolder = (folder: string | undefined): FolderResult => {
  if (folder === undefined) {
    return { ok: true, folder: "" };
  }
  const trimmed = folder.trim();
  if (trimmed === "") {
    return { ok: true, folder: "" };
  }
  if (trimmed.startsWith("/") || trimmed.startsWith("\\") || /^[A-Za-z]:/.test(trimmed)) {
    return { ok: false, problem: `folder "${folder}" must be relative to the vault` };
  }
  const segments = relativeSegments(toPosix(trimmed));
  if (segments.includes("..")) {
    return { ok: false, problem: `folder "${folder}" must not contain ".."` };
  }
  const first = segments[0] ?? "";
  if (isReservedRoot(first)) {
    return { ok: false, problem: `folder "${first}" is reserved at the vault root` };
  }
  return { ok: true, folder: segments.join("/") };
};

const resolveSegments = (root: string, ref: string): string[] | undefined => {
  const normalized = toPosix(ref);
  const raw = normalized.startsWith("/") ? toPosix(relative(root, normalized)) : normalized;
  if (raw === "" || raw.startsWith("/")) {
    return undefined;
  }
  const segments = relativeSegments(raw);
  if (segments.length === 0 || segments.includes("..")) {
    return undefined;
  }
  if (isReservedRoot(segments[0] ?? "")) {
    return undefined;
  }
  return segments;
};

export const resolveVaultPath = (root: string, ref: string): VaultFile | undefined => {
  const segments = resolveSegments(root, ref);
  if (segments === undefined) {
    return undefined;
  }
  const last = segments[segments.length - 1] ?? "";
  const withoutLast = segments.slice(0, -1);
  const candidates = [segments, [...withoutLast, `${last}.md`]];
  for (const name of candidates) {
    const fileName = name[name.length - 1] ?? "";
    if (!MARKDOWN_FILE.test(fileName)) {
      continue;
    }
    const absolutePath = join(root, ...name);
    if (!isRegularFile(root, absolutePath)) {
      continue;
    }
    return toVaultFile(root, absolutePath);
  }
  return undefined;
};

export const objectFileCandidates = (slug: string, id: string): string[] => {
  const stem = slug === "" ? `objeto-${id.slice(0, 4).toLowerCase()}` : slug;
  return [
    `${stem}.md`,
    ...[4, 6, 8, 12, 16, 26].map((length) => `${stem}-${id.slice(0, length).toLowerCase()}.md`),
  ];
};
