import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type ObjectFrontmatter, parseObjectFile, writeObjectFile } from "../frontmatter/index.js";
import { DEFAULT_TYPE } from "../frontmatter/keys.js";
import { slugify } from "../slug.js";
import { loadTypeRegistry, type TypeDefinition, type TypeWarning } from "../types/index.js";
import { newUlid } from "../ulid.js";
import { ObjectOperationError } from "./errors.js";
import type {
  CreateObjectInput,
  ObjectRecord,
  ObjectRepository,
  ObjectSummary,
  ReadObjectResult,
  UpdateObjectChanges,
} from "./model.js";
import { assertTimeZone, formatTimestamp } from "./timestamps.js";
import { checkAttributes } from "./validate.js";
import {
  normalizeFolder,
  resolveVaultPath,
  scanVaultFiles,
  selectFileName,
  type VaultFile,
} from "./vault.js";

export type CreateObjectRepositoryOptions = {
  vaultDir: string;
  timeZone?: string;
};

type LocatedObject = {
  file: VaultFile;
  text: string;
  result: ReadObjectResult;
};

export const createObjectRepository = (
  options: CreateObjectRepositoryOptions,
): ObjectRepository => {
  const vaultDir = resolve(options.vaultDir);
  const timeZone = assertTimeZone(options.timeZone ?? "UTC");
  const tiposDir = join(vaultDir, "tipos");

  const invalidWrite = (problems: readonly string[]): ObjectOperationError =>
    new ObjectOperationError("error.invalidObjectWrite", { problems: problems.join("; ") }, [
      ...problems,
    ]);

  const notFound = (ref: string): ObjectOperationError =>
    new ObjectOperationError("error.objectNotFound", { id: ref });

  const missingRequired = (missing: readonly string[]): ObjectOperationError =>
    new ObjectOperationError(
      "error.missingRequiredAttribute",
      { id: missing.join(", ") },
      missing.map((attributeId) => `missing required attribute "${attributeId}"`),
      [...missing],
    );

  const requireDefinition = (typeId: string): TypeDefinition => {
    const definition = loadTypeRegistry(tiposDir).types.get(typeId);
    if (definition === undefined) {
      throw invalidWrite([`unknown type "${typeId}" (no type definition in ${tiposDir})`]);
    }
    return definition;
  };

  const toRecord = (
    file: VaultFile,
    frontmatter: ObjectFrontmatter,
    body: string,
  ): ObjectRecord => ({
    id: frontmatter.id,
    type: frontmatter.type ?? DEFAULT_TYPE,
    title: frontmatter.title,
    path: file.relativePath,
    folder: file.folder,
    fileName: file.fileName,
    created: frontmatter.created,
    updated: frontmatter.updated,
    links: [...frontmatter.links],
    attributes: { ...frontmatter.attributes },
    body,
  });

  const toSummary = (record: ObjectRecord): ObjectSummary => ({
    id: record.id,
    type: record.type,
    title: record.title,
    path: record.path,
    folder: record.folder,
    updated: record.updated,
  });

  const tryRead = (file: VaultFile): { text: string; result: ReadObjectResult } => {
    let text: string;
    try {
      text = readFileSync(file.absolutePath, "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        text: "",
        result: {
          ok: false,
          path: file.relativePath,
          problems: [message],
          raw: { yamlText: "", body: "" },
        },
      };
    }
    const parsed = parseObjectFile(text);
    if (!parsed.ok) {
      return {
        text,
        result: { ok: false, path: file.relativePath, problems: parsed.problems, raw: parsed.raw },
      };
    }
    return { text, result: { ok: true, object: toRecord(file, parsed.frontmatter, parsed.body) } };
  };

  const locate = (ref: string): LocatedObject => {
    const direct = resolveVaultPath(vaultDir, ref);
    if (direct !== undefined) {
      const read = tryRead(direct);
      return { file: direct, text: read.text, result: read.result };
    }
    let titleMatch: LocatedObject | undefined;
    for (const file of scanVaultFiles(vaultDir)) {
      const read = tryRead(file);
      if (!read.result.ok) {
        continue;
      }
      const located: LocatedObject = { file, text: read.text, result: read.result };
      if (read.result.object.id === ref) {
        return located;
      }
      if (titleMatch === undefined && read.result.object.title === ref) {
        titleMatch = located;
      }
    }
    if (titleMatch !== undefined) {
      return titleMatch;
    }
    throw notFound(ref);
  };

  const listObjects = (): ObjectSummary[] => {
    const summaries: ObjectSummary[] = [];
    for (const file of scanVaultFiles(vaultDir)) {
      const read = tryRead(file);
      if (read.result.ok) {
        summaries.push(toSummary(read.result.object));
      }
    }
    return summaries.sort((left, right) => left.id.localeCompare(right.id));
  };

  const readObject = (ref: string): ReadObjectResult => locate(ref).result;

  const findObjectByTitle = (title: string): ObjectSummary | undefined =>
    listObjects().find((summary) => summary.title === title);

  const createObject = (input: CreateObjectInput): ObjectRecord => {
    const title = input.title;
    if (title.trim() === "") {
      throw invalidWrite(["title must not be empty"]);
    }
    const folderCheck = normalizeFolder(input.folder);
    if (!folderCheck.ok) {
      throw invalidWrite([folderCheck.problem]);
    }
    const typeId = input.type ?? DEFAULT_TYPE;
    const definition = requireDefinition(typeId);
    const attributes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input.attributes ?? {})) {
      if (value !== undefined) {
        attributes[key] = value;
      }
    }
    const check = checkAttributes(definition, attributes);
    if (check.missing.length > 0) {
      throw missingRequired(check.missing);
    }
    if (check.problems.length > 0) {
      throw invalidWrite(check.problems);
    }
    const folder = folderCheck.folder;
    const dir = folder === "" ? vaultDir : join(vaultDir, folder);
    const id = newUlid();
    const now = formatTimestamp(new Date(), timeZone);
    const slug = slugify(title);
    const fileName = selectFileName(dir, slug, id);
    if (fileName === undefined) {
      throw invalidWrite([`no free file name for "${slug}" in folder "${folder}"`]);
    }
    const body = input.body ?? "";
    const links = input.links ?? [];
    const frontmatter: ObjectFrontmatter = {
      id,
      type: typeId,
      title,
      created: now,
      updated: now,
      links,
      attributes,
    };
    const text = writeObjectFile(frontmatter, body);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, fileName), text, { encoding: "utf8", flag: "wx" });
    const relativePath = folder === "" ? fileName : `${folder}/${fileName}`;
    return {
      id,
      type: typeId,
      title,
      path: relativePath,
      folder,
      fileName,
      created: now,
      updated: now,
      links: [...links],
      attributes: { ...attributes },
      body,
    };
  };

  const updateObject = (id: string, changes: UpdateObjectChanges): ObjectRecord => {
    const located = locate(id);
    if (!located.result.ok) {
      throw invalidWrite([
        `unreadable object file "${located.result.path}"`,
        ...located.result.problems,
      ]);
    }
    const object = located.result.object;
    if (changes.title !== undefined && changes.title !== object.title) {
      throw new ObjectOperationError("error.titleChangeRequiresRename");
    }
    const requestedType: unknown = changes.type;
    if (requestedType !== undefined && requestedType !== object.type) {
      throw invalidWrite(['the "tipo" field is immutable; updateObject cannot change it']);
    }
    const definition = requireDefinition(object.type);
    const merged = { ...object.attributes, ...(changes.attributes ?? {}) };
    const attributes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined) {
        attributes[key] = value;
      }
    }
    const check = checkAttributes(definition, attributes);
    if (check.missing.length > 0) {
      throw missingRequired(check.missing);
    }
    if (check.problems.length > 0) {
      throw invalidWrite(check.problems);
    }
    const links = changes.links ?? object.links;
    const body = changes.body ?? object.body;
    const updated = formatTimestamp(new Date(), timeZone);
    const frontmatter: ObjectFrontmatter = {
      id: object.id,
      type: object.type,
      title: object.title,
      created: object.created,
      updated,
      links,
      attributes,
    };
    const text = writeObjectFile(frontmatter, body, located.text);
    writeFileSync(located.file.absolutePath, text, "utf8");
    return toRecord(located.file, frontmatter, body);
  };

  const deleteObject = (id: string): void => {
    unlinkSync(locate(id).file.absolutePath);
  };

  const listTypes = (): TypeDefinition[] =>
    [...loadTypeRegistry(tiposDir).types.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    );

  const listTypeWarnings = (): TypeWarning[] => loadTypeRegistry(tiposDir).warnings;

  const getType = (typeId: string): TypeDefinition | undefined =>
    loadTypeRegistry(tiposDir).types.get(typeId);

  return {
    listObjects,
    readObject,
    createObject,
    updateObject,
    deleteObject,
    listTypes,
    listTypeWarnings,
    getType,
    findObjectByTitle,
  };
};
