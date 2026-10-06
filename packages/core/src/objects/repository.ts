import { unlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  type ObjectFrontmatter,
  parseObjectFile,
  salvageObject,
  writeObjectFile,
} from "../frontmatter/index.js";
import { DEFAULT_TYPE } from "../frontmatter/keys.js";
import { slugify } from "../slug.js";
import { loadTypeRegistry, type TypeDefinition, type TypeWarning } from "../types/index.js";
import { newUlid } from "../ulid.js";
import { createFileExclusive, writeFileAtomic } from "./atomic.js";
import { degradationReasons, isTypeDegraded } from "./degraded.js";
import { ObjectOperationError } from "./errors.js";
import type {
  CreateObjectInput,
  DegradedObjectView,
  DomainEvent,
  LocatedObject,
  ObjectRecord,
  ObjectRepository,
  ObjectSummary,
  ReadObjectResult,
  UpdateObjectChanges,
} from "./model.js";
import { createRenameOperations, type RenameOperations } from "./rename.js";
import { assertTimeZone, formatTimestamp } from "./timestamps.js";
import { checkAttributeSafety, checkAttributes } from "./validate.js";
import {
  ensureVaultDirectory,
  normalizeFolder,
  objectFileCandidates,
  readObjectText,
  resolveVaultPath,
  scanVaultFiles,
  type VaultFile,
} from "./vault.js";

export type CreateObjectRepositoryOptions = {
  vaultDir: string;
  timeZone?: string;
  onEvent?: (event: DomainEvent) => void;
};

type LoadedRegistry = {
  types: Map<string, TypeDefinition>;
  warnings: TypeWarning[];
};

type ObjectIndex = {
  byId: Map<string, VaultFile>;
  byTitle: Map<string, VaultFile[]>;
};

const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;

const writeNewFile = (
  dir: string,
  candidates: readonly string[],
  text: string,
): string | undefined => {
  for (const candidate of candidates) {
    try {
      createFileExclusive(join(dir, candidate), text);
      return candidate;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") {
        throw error;
      }
    }
  }
  return undefined;
};

export const createObjectRepository = (
  options: CreateObjectRepositoryOptions,
): ObjectRepository => {
  const vaultDir = resolve(options.vaultDir);
  const timeZone = assertTimeZone(options.timeZone ?? "UTC");
  const tiposDir = join(vaultDir, "tipos");
  const sanitizePath = (message: string): string => message.replaceAll(vaultDir, ".");

  const emit = (event: DomainEvent): void => {
    options.onEvent?.(event);
  };

  let registry: LoadedRegistry | undefined;
  let index: ObjectIndex | undefined;

  const currentRegistry = (): LoadedRegistry => {
    registry ??= loadTypeRegistry(tiposDir);
    return registry;
  };

  const refreshRegistry = (): LoadedRegistry => {
    registry = loadTypeRegistry(tiposDir);
    return registry;
  };

  const invalidateIndex = (): void => {
    index = undefined;
  };

  const invalidWrite = (problems: readonly string[]): ObjectOperationError =>
    new ObjectOperationError("error.invalidObjectWrite", { problems: problems.join("; ") }, [
      ...problems,
    ]);

  const notFound = (ref: string): ObjectOperationError =>
    new ObjectOperationError("error.objectNotFound", { id: ref });

  const ambiguousTitle = (title: string): ObjectOperationError =>
    new ObjectOperationError("error.ambiguousTitle", { title });

  const missingRequired = (missing: readonly string[]): ObjectOperationError =>
    new ObjectOperationError(
      "error.missingRequiredAttribute",
      { id: missing.join(", ") },
      missing.map((attributeId) => `missing required attribute "${attributeId}"`),
      [...missing],
    );

  const requireDefinition = (typeId: string): TypeDefinition => {
    const definition = currentRegistry().types.get(typeId);
    if (definition === undefined) {
      throw invalidWrite([
        `unknown type "${typeId}" (no type definition in ${basename(tiposDir)})`,
      ]);
    }
    return definition;
  };

  const toRecord = (
    file: VaultFile,
    frontmatter: ObjectFrontmatter,
    body: string,
  ): ObjectRecord => {
    const type = frontmatter.type ?? DEFAULT_TYPE;
    const attributes = { ...frontmatter.attributes };
    return {
      id: frontmatter.id,
      type,
      title: frontmatter.title,
      path: file.relativePath,
      folder: file.folder,
      fileName: file.fileName,
      created: frontmatter.created,
      updated: frontmatter.updated,
      links: [...frontmatter.links],
      attributes,
      body,
      degraded: degradationReasons(currentRegistry(), type, attributes),
    };
  };

  const toSummary = (record: ObjectRecord): ObjectSummary => ({
    id: record.id,
    type: record.type,
    title: record.title,
    path: record.path,
    folder: record.folder,
    updated: record.updated,
    degraded: [...record.degraded],
  });

  const degradedView = (file: VaultFile, text: string): DegradedObjectView => {
    const salvaged = salvageObject(text);
    return {
      title: salvaged.title ?? file.fileName.replace(/\.md$/i, ""),
      body: salvaged.body,
      attributes: salvaged.attributes,
    };
  };

  const tryRead = (file: VaultFile): { text: string; result: ReadObjectResult } => {
    let text: string;
    try {
      text = readObjectText(file.absolutePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        text: "",
        result: {
          ok: false,
          path: file.relativePath,
          problems: [sanitizePath(message)],
          raw: { yamlText: "", body: "" },
          degraded: degradedView(file, ""),
        },
      };
    }
    const parsed = parseObjectFile(text);
    if (!parsed.ok) {
      return {
        text,
        result: {
          ok: false,
          path: file.relativePath,
          problems: parsed.problems,
          raw: parsed.raw,
          degraded: degradedView(file, text),
        },
      };
    }
    return { text, result: { ok: true, object: toRecord(file, parsed.frontmatter, parsed.body) } };
  };

  const buildIndex = (): ObjectIndex => {
    const files = scanVaultFiles(vaultDir);
    const byId = new Map<string, VaultFile>();
    const byTitle = new Map<string, VaultFile[]>();
    for (const file of files) {
      const read = tryRead(file);
      if (!read.result.ok) {
        continue;
      }
      const { id, title } = read.result.object;
      if (!byId.has(id)) {
        byId.set(id, file);
      }
      const titled = byTitle.get(title);
      if (titled === undefined) {
        byTitle.set(title, [file]);
      } else {
        titled.push(file);
      }
    }
    return { byId, byTitle };
  };

  const withIndex = <T>(lookup: (current: ObjectIndex) => T | undefined): T | undefined => {
    if (index === undefined) {
      index = buildIndex();
    }
    return lookup(index);
  };

  const candidatesOf = (current: ObjectIndex, ref: string): readonly VaultFile[] => {
    const direct = current.byId.get(ref);
    if (direct !== undefined) {
      return [direct];
    }
    return current.byTitle.get(ref) ?? [];
  };

  const resolveMatches = (ref: string, files: readonly VaultFile[]): LocatedObject | undefined => {
    const titleMatches: LocatedObject[] = [];
    for (const file of files) {
      const read = tryRead(file);
      if (!read.result.ok) {
        continue;
      }
      const located: LocatedObject = { file, text: read.text, result: read.result };
      if (read.result.object.id === ref) {
        return located;
      }
      if (read.result.object.title === ref) {
        titleMatches.push(located);
      }
    }
    if (titleMatches.length > 1) {
      throw ambiguousTitle(ref);
    }
    return titleMatches[0];
  };

  const locate = (ref: string): LocatedObject => {
    const direct = resolveVaultPath(vaultDir, ref);
    if (direct !== undefined) {
      const read = tryRead(direct);
      return { file: direct, text: read.text, result: read.result };
    }
    const located = withIndex((current) => resolveMatches(ref, candidatesOf(current, ref)));
    if (located === undefined) {
      throw notFound(ref);
    }
    return located;
  };

  const toDegradedSummary = (
    file: VaultFile,
    result: Extract<ReadObjectResult, { ok: false }>,
  ): ObjectSummary => ({
    id: "",
    type: "",
    title: result.degraded.title,
    path: result.path,
    folder: file.folder,
    updated: "",
    degraded: [{ kind: "unreadableFrontmatter", problems: [...result.problems] }],
  });

  const listObjects = (): ObjectSummary[] => {
    const summaries: ObjectSummary[] = [];
    for (const file of scanVaultFiles(vaultDir)) {
      const read = tryRead(file);
      summaries.push(
        read.result.ok ? toSummary(read.result.object) : toDegradedSummary(file, read.result),
      );
    }
    return summaries.sort((left, right) => left.id.localeCompare(right.id));
  };

  const scanObjects = (): LocatedObject[] => {
    const scanned: LocatedObject[] = [];
    for (const file of scanVaultFiles(vaultDir)) {
      const read = tryRead(file);
      scanned.push({ file, text: read.text, result: read.result });
    }
    return scanned;
  };

  const readObject = (ref: string): ReadObjectResult => locate(ref).result;

  const findObjectByTitle = (title: string): ObjectSummary | undefined =>
    withIndex((current) => {
      const matches: ObjectRecord[] = [];
      for (const file of current.byTitle.get(title) ?? []) {
        const read = tryRead(file);
        if (read.result.ok && read.result.object.title === title) {
          matches.push(read.result.object);
        }
      }
      matches.sort((left, right) => left.id.localeCompare(right.id));
      const first = matches[0];
      return first === undefined ? undefined : toSummary(first);
    });

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
    if (!ensureVaultDirectory(vaultDir, dir)) {
      throw invalidWrite([`folder "${folder}" is not a regular directory inside the vault`]);
    }
    const fileName = writeNewFile(dir, objectFileCandidates(slug, id), text);
    if (fileName === undefined) {
      throw invalidWrite([`no free file name for "${slug}" in folder "${folder}"`]);
    }
    invalidateIndex();
    const relativePath = folder === "" ? fileName : `${folder}/${fileName}`;
    emit({ type: "ObjectCreated", objectId: id, path: relativePath });
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
      degraded: [],
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
      throw new ObjectOperationError("error.typeImmutable");
    }
    const merged = { ...object.attributes, ...(changes.attributes ?? {}) };
    const attributes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined) {
        attributes[key] = value;
      }
    }
    if (isTypeDegraded(object.degraded)) {
      const safety = checkAttributeSafety(attributes);
      if (safety.length > 0) {
        throw invalidWrite(safety);
      }
    } else {
      const definition = requireDefinition(object.type);
      const check = checkAttributes(definition, attributes);
      if (check.missing.length > 0) {
        throw missingRequired(check.missing);
      }
      if (check.problems.length > 0) {
        throw invalidWrite(check.problems);
      }
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
    let current: string;
    try {
      current = readObjectText(located.file.absolutePath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw invalidWrite([`unreadable object file "${located.file.relativePath}"`, detail]);
    }
    if (current !== located.text) {
      throw invalidWrite([
        `object file "${located.file.relativePath}" changed on disk since it was read`,
      ]);
    }
    writeFileAtomic(located.file.absolutePath, text);
    invalidateIndex();
    emit({ type: "ObjectUpdated", objectId: object.id, path: located.file.relativePath });
    return toRecord(located.file, frontmatter, body);
  };

  const deleteObject = (id: string): void => {
    const located = locate(id);
    const objectId = located.result.ok ? located.result.object.id : id;
    try {
      unlinkSync(located.file.absolutePath);
    } catch (error) {
      const detail = errorCode(error) ?? "unknown filesystem error";
      throw new ObjectOperationError("error.objectDeleteFailed", { id, detail }, [detail]);
    }
    invalidateIndex();
    emit({ type: "ObjectDeleted", objectId, path: located.file.relativePath });
  };

  const listTypes = (): TypeDefinition[] =>
    [...refreshRegistry().types.values()].sort((left, right) => left.id.localeCompare(right.id));

  const listTypeWarnings = (): TypeWarning[] => refreshRegistry().warnings;

  const getType = (typeId: string): TypeDefinition | undefined =>
    currentRegistry().types.get(typeId);

  const { renameObject, moveObject, findIncomingLinks }: RenameOperations = createRenameOperations({
    vaultDir,
    timeZone,
    locate,
    scanObjects,
    invalidateIndex,
    invalidWrite,
    ambiguousTitle,
    emit,
  });

  return {
    listObjects,
    readObject,
    createObject,
    updateObject,
    deleteObject,
    renameObject,
    moveObject,
    findIncomingLinks,
    listTypes,
    listTypeWarnings,
    getType,
    findObjectByTitle,
  };
};
