import { constants, copyFileSync, linkSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { type ObjectFrontmatter, writeObjectFile } from "../frontmatter/index.js";
import {
  findUnresolvedWikiLinks,
  normalizeTitle,
  parseWikiLinks,
  rewriteWikiLinks,
  type TitleResolver,
  type WikiLinkTarget,
} from "../links/index.js";
import { slugify } from "../slug.js";
import { removeFileQuietly, writeFileAtomic, writeTempFile } from "./atomic.js";
import { ObjectOperationError } from "./errors.js";
import type { IncomingLink, LocatedObject, ObjectRecord, RenameReport } from "./model.js";
import { formatTimestamp } from "./timestamps.js";
import {
  ensureVaultDirectory,
  normalizeFolder,
  objectFileCandidates,
  readObjectText,
  type VaultFile,
} from "./vault.js";

export type RenameHost = {
  vaultDir: string;
  timeZone: string;
  locate: (ref: string) => LocatedObject;
  scanObjects: () => LocatedObject[];
  invalidateIndex: () => void;
  invalidWrite: (problems: readonly string[]) => ObjectOperationError;
  ambiguousTitle: (title: string) => ObjectOperationError;
};

export type RenameOperations = {
  renameObject: (ref: string, newTitle: string) => RenameReport;
  moveObject: (ref: string, folder: string) => ObjectRecord;
  findIncomingLinks: (ref: string) => IncomingLink[];
};

type ScannedObject = {
  file: VaultFile;
  text: string;
  object: ObjectRecord;
};

const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;

const detailOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const moveFile = (source: string, target: string): boolean => {
  if (source === target) {
    return true;
  }
  try {
    linkSync(source, target);
  } catch (error) {
    const code = errorCode(error);
    if (code === "EEXIST") {
      return false;
    }
    if (code !== "EXDEV") {
      throw error;
    }
    try {
      copyFileSync(source, target, constants.COPYFILE_EXCL);
    } catch (copyError) {
      if (errorCode(copyError) === "EEXIST") {
        return false;
      }
      throw copyError;
    }
  }
  try {
    unlinkSync(source);
  } catch (error) {
    removeFileQuietly(target);
    throw error;
  }
  return true;
};

const claimFileName = (
  source: string,
  dir: string,
  candidates: readonly string[],
): string | undefined => {
  for (const candidate of candidates) {
    if (moveFile(source, join(dir, candidate))) {
      return candidate;
    }
  }
  return undefined;
};

export const createRenameOperations = (host: RenameHost): RenameOperations => {
  const renameFailed = (path: string, detail: string): ObjectOperationError =>
    new ObjectOperationError("error.objectRenameFailed", { path }, [detail]);

  const requireReadable = (ref: string): { located: LocatedObject; object: ObjectRecord } => {
    const located = host.locate(ref);
    if (!located.result.ok) {
      throw host.invalidWrite([
        `unreadable object file "${located.result.path}"`,
        ...located.result.problems,
      ]);
    }
    return { located, object: located.result.object };
  };

  const scanReadable = (): ScannedObject[] => {
    const scanned: ScannedObject[] = [];
    for (const located of host.scanObjects()) {
      if (located.result.ok) {
        scanned.push({ file: located.file, text: located.text, object: located.result.object });
      }
    }
    return scanned;
  };

  const readText = (file: VaultFile): string => {
    try {
      return readObjectText(file.absolutePath);
    } catch (error) {
      throw renameFailed(file.relativePath, detailOf(error));
    }
  };

  const writeAndClaim = (
    source: string,
    dir: string,
    displayPath: string,
    candidates: readonly string[],
    text: string,
  ): string | undefined => {
    let temp: string | undefined;
    try {
      for (const candidate of candidates) {
        const target = join(dir, candidate);
        if (target === source) {
          writeFileAtomic(target, text);
          return candidate;
        }
        temp ??= writeTempFile(dir, text);
        try {
          linkSync(temp, target);
        } catch (error) {
          if (errorCode(error) === "EEXIST") {
            continue;
          }
          throw error;
        }
        try {
          unlinkSync(source);
        } catch (error) {
          removeFileQuietly(target);
          throw error;
        }
        return candidate;
      }
      return undefined;
    } catch (error) {
      throw renameFailed(displayPath, detailOf(error));
    } finally {
      if (temp !== undefined) {
        removeFileQuietly(temp);
      }
    }
  };

  const renameObject = (ref: string, newTitle: string): RenameReport => {
    const { located, object } = requireReadable(ref);
    const title = newTitle.trim();
    if (title === "") {
      throw host.invalidWrite(["title must not be empty"]);
    }
    if (title === object.title) {
      return { object, rewritten: [], skipped: [], unresolvedLinks: [] };
    }
    const scanned = host.scanObjects();
    const readable: ScannedObject[] = [];
    for (const entry of scanned) {
      if (entry.result.ok) {
        readable.push({ file: entry.file, text: entry.text, object: entry.result.object });
      }
    }
    const collisions = readable.filter(
      (entry) =>
        entry.object.id !== object.id &&
        normalizeTitle(entry.object.title) === normalizeTitle(title),
    );
    if (collisions.length > 0) {
      throw host.ambiguousTitle(title);
    }
    const oldTitle = object.title;
    const oldNorm = normalizeTitle(oldTitle);
    const now = formatTimestamp(new Date(), host.timeZone);
    const body = rewriteWikiLinks(object.body, oldTitle, title);
    const links = object.links.map((link) => rewriteWikiLinks(link, oldTitle, title));
    const dir = object.folder === "" ? host.vaultDir : join(host.vaultDir, object.folder);
    const slug = slugify(title);
    const rewritten: string[] = [];
    const skipped: { path: string; problems: string[] }[] = [];
    const unresolvedLinks: { path: string; link: string }[] = [];
    let fileName = object.fileName;
    try {
      const ownText = readText(located.file);
      if (ownText !== located.text) {
        throw renameFailed(located.file.relativePath, "file changed on disk since it was read");
      }
      const frontmatter: ObjectFrontmatter = {
        id: object.id,
        type: object.type,
        title,
        created: object.created,
        updated: now,
        links,
        attributes: object.attributes,
      };
      const claimed = writeAndClaim(
        located.file.absolutePath,
        dir,
        located.file.relativePath,
        objectFileCandidates(slug, object.id),
        writeObjectFile(frontmatter, body, ownText),
      );
      if (claimed === undefined) {
        throw host.invalidWrite([`no free file name for "${slug}" in folder "${object.folder}"`]);
      }
      fileName = claimed;
      const renamedPath = object.folder === "" ? fileName : `${object.folder}/${fileName}`;

      const targets = new Map<string, WikiLinkTarget>();
      for (const entry of readable) {
        if (entry.object.id !== object.id) {
          const key = normalizeTitle(entry.object.title);
          if (!targets.has(key)) {
            targets.set(key, { id: entry.object.id, path: entry.object.path });
          }
        }
      }
      targets.set(normalizeTitle(title), { id: object.id, path: renamedPath });
      const resolve: TitleResolver = (candidate) => targets.get(normalizeTitle(candidate));
      const collectUnresolved = (text: string, path: string): void => {
        for (const link of findUnresolvedWikiLinks(text, resolve)) {
          if (normalizeTitle(link.title) === oldNorm) {
            unresolvedLinks.push({ path, link: link.raw });
          }
        }
      };

      for (const entry of scanned) {
        const path = entry.file.relativePath;
        if (!entry.result.ok) {
          const affected = findUnresolvedWikiLinks(entry.text, resolve).filter(
            (link) => normalizeTitle(link.title) === oldNorm,
          );
          if (affected.length === 0) {
            continue;
          }
          skipped.push({ path, problems: [...entry.result.problems] });
          for (const link of affected) {
            unresolvedLinks.push({ path, link: link.raw });
          }
          continue;
        }
        const currentObject = entry.result.object;
        if (currentObject.id === object.id) {
          continue;
        }
        const linksInBody = parseWikiLinks(currentObject.body).some(
          (link) => normalizeTitle(link.title) === oldNorm,
        );
        const linksInFrontmatter = currentObject.links.some((value) =>
          parseWikiLinks(value).some((link) => normalizeTitle(link.title) === oldNorm),
        );
        if (!linksInBody && !linksInFrontmatter) {
          continue;
        }
        let current: string;
        try {
          current = readObjectText(entry.file.absolutePath);
        } catch (error) {
          skipped.push({ path, problems: [detailOf(error)] });
          collectUnresolved(entry.text, path);
          continue;
        }
        if (current !== entry.text) {
          skipped.push({ path, problems: ["file changed on disk since it was scanned"] });
          collectUnresolved(current, path);
          continue;
        }
        try {
          const nextBody = rewriteWikiLinks(currentObject.body, oldTitle, title);
          const nextLinks = currentObject.links.map((link) =>
            rewriteWikiLinks(link, oldTitle, title),
          );
          const nextFrontmatter: ObjectFrontmatter = {
            id: currentObject.id,
            type: currentObject.type,
            title: currentObject.title,
            created: currentObject.created,
            updated: currentObject.updated,
            links: nextLinks,
            attributes: currentObject.attributes,
          };
          const nextText = writeObjectFile(nextFrontmatter, nextBody, current);
          writeFileAtomic(entry.file.absolutePath, nextText);
          rewritten.push(path);
        } catch (error) {
          skipped.push({ path, problems: [detailOf(error)] });
          collectUnresolved(current, path);
        }
      }
    } finally {
      host.invalidateIndex();
    }

    const path = object.folder === "" ? fileName : `${object.folder}/${fileName}`;
    const renamed: ObjectRecord = {
      ...object,
      title,
      path,
      fileName,
      updated: now,
      links,
      body,
    };
    return { object: renamed, rewritten, skipped, unresolvedLinks };
  };

  const moveObject = (ref: string, folder: string): ObjectRecord => {
    const { located, object } = requireReadable(ref);
    const check = normalizeFolder(folder);
    if (!check.ok) {
      throw host.invalidWrite([check.problem]);
    }
    const target = check.folder;
    if (target === object.folder) {
      return object;
    }
    const dir = target === "" ? host.vaultDir : join(host.vaultDir, target);
    const stem = object.fileName.endsWith(".md") ? object.fileName.slice(0, -3) : object.fileName;
    let fileName: string | undefined;
    try {
      if (!ensureVaultDirectory(host.vaultDir, dir)) {
        throw host.invalidWrite([`folder "${target}" is not a regular directory inside the vault`]);
      }
      fileName = claimFileName(
        located.file.absolutePath,
        dir,
        objectFileCandidates(stem, object.id),
      );
    } catch (error) {
      if (error instanceof ObjectOperationError) {
        throw error;
      }
      throw renameFailed(object.path, detailOf(error));
    } finally {
      host.invalidateIndex();
    }
    if (fileName === undefined) {
      throw host.invalidWrite([`no free file name for "${stem}" in folder "${target}"`]);
    }
    const path = target === "" ? fileName : `${target}/${fileName}`;
    return { ...object, path, folder: target, fileName };
  };

  const findIncomingLinks = (ref: string): IncomingLink[] => {
    const { object } = requireReadable(ref);
    const target = normalizeTitle(object.title);
    const incoming: IncomingLink[] = [];
    for (const entry of scanReadable()) {
      for (const value of entry.object.links) {
        for (const link of parseWikiLinks(value)) {
          if (normalizeTitle(link.title) === target) {
            incoming.push({
              objectId: entry.object.id,
              path: entry.object.path,
              context: "frontmatter",
              raw: link.raw,
            });
          }
        }
      }
      for (const link of parseWikiLinks(entry.object.body)) {
        if (normalizeTitle(link.title) === target) {
          incoming.push({
            objectId: entry.object.id,
            path: entry.object.path,
            context: "body",
            raw: link.raw,
          });
        }
      }
    }
    return incoming;
  };

  return { renameObject, moveObject, findIncomingLinks };
};
