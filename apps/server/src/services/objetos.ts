import {
  type CreateObjectBody,
  type ObjectPayload,
  objectPayloadSchema,
  type PatchObjectBody,
  type SearchParams,
} from "@migite/contracts";
import {
  createObjectRepository,
  ObjectOperationError,
  type ObjectRecord,
  type ObjectRepository,
  type ReadObjectResult,
} from "@migite/core";
import {
  type IndexDatabase,
  type IndexedObject,
  listObjectsIndexed,
  type ObjectFilters,
  searchObjects,
} from "@migite/index";

export type ObjetosDeps = {
  readonly db: IndexDatabase;
  readonly vaultDir: string;
  readonly timeZone?: string;
};

export type ObjetosPage = {
  readonly objetos: ObjectPayload[];
  readonly siguienteCursor: string | null;
};

export const DEFAULT_LIST_LIMIT = 50;

export const MAX_LIST_OFFSET = 10_000;

const CURSOR_OFFSET_KEY = "o";

export const encodeCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ [CURSOR_OFFSET_KEY]: offset }), "utf8").toString("base64url");

export const decodeCursor = (cursor: string): number | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const offset = (parsed as Record<string, unknown>)[CURSOR_OFFSET_KEY];
  if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0) {
    return undefined;
  }
  return offset;
};

const folderOf = (path: string): string => {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
};

const toPayload = (object: ObjectRecord): ObjectPayload =>
  objectPayloadSchema.parse({
    id: object.id,
    tipo: object.type,
    titulo: object.title,
    ruta: object.path,
    carpeta: object.folder,
    creado: object.created,
    actualizado: object.updated,
    atributos: object.attributes,
    cuerpo: object.body,
    enlaces: object.links,
    degraded: object.degraded,
  });

const toDegradedPayload = (
  id: string,
  result: Extract<ReadObjectResult, { ok: false }>,
): ObjectPayload =>
  objectPayloadSchema.parse({
    id,
    tipo: "",
    titulo: result.degraded.title,
    ruta: result.path,
    carpeta: folderOf(result.path),
    creado: "",
    actualizado: "",
    atributos: result.degraded.attributes,
    cuerpo: result.degraded.body,
    enlaces: [],
    degraded: [{ kind: "unreadableFrontmatter", problems: [...result.problems] }],
  });

const createRepository = (deps: ObjetosDeps): ObjectRepository =>
  createObjectRepository({ vaultDir: deps.vaultDir, timeZone: deps.timeZone });

const payloadOf = (repository: ObjectRepository, id: string): ObjectPayload | undefined => {
  try {
    const result = repository.readObject(id);
    return result.ok ? toPayload(result.object) : toDegradedPayload(id, result);
  } catch (error) {
    if (error instanceof ObjectOperationError && error.key === "error.objectNotFound") {
      return undefined;
    }
    throw error;
  }
};

export const getObjeto = (deps: ObjetosDeps, ref: string): ObjectPayload => {
  const result = createRepository(deps).readObject(ref);
  return result.ok ? toPayload(result.object) : toDegradedPayload(ref, result);
};

export type RenameReportPayload = {
  readonly objeto: ObjectPayload;
  readonly informe: {
    readonly reescritos: string[];
    readonly omitidos: { path: string; problems: string[] }[];
    readonly enlacesSinResolver: { path: string; link: string }[];
  };
};

export const confirmationRequired = (): ObjectOperationError =>
  new ObjectOperationError("error.confirmationRequired");

export const createObjeto = (deps: ObjetosDeps, input: CreateObjectBody): ObjectPayload =>
  toPayload(
    createRepository(deps).createObject({
      title: input.titulo,
      type: input.tipo,
      body: input.cuerpo,
      attributes: input.atributos,
      folder: input.carpeta,
    }),
  );

export const patchObjeto = (
  deps: ObjetosDeps,
  ref: string,
  changes: PatchObjectBody,
): ObjectPayload => {
  const repository = createRepository(deps);
  const current = repository.readObject(ref);
  if (changes.tipo !== undefined && (!current.ok || current.object.type !== changes.tipo)) {
    throw new ObjectOperationError("error.typeImmutable");
  }

  let effectiveRef = ref;
  if (changes.carpeta !== undefined) {
    const currentFolder = current.ok ? current.object.folder : folderOf(current.path);
    if (currentFolder !== changes.carpeta) {
      effectiveRef = repository.moveObject(ref, changes.carpeta).id;
    }
  }

  const touchesContent =
    changes.titulo !== undefined || changes.cuerpo !== undefined || changes.atributos !== undefined;
  if (!touchesContent) {
    const result = repository.readObject(effectiveRef);
    return result.ok ? toPayload(result.object) : toDegradedPayload(effectiveRef, result);
  }

  return toPayload(
    repository.updateObject(effectiveRef, {
      title: changes.titulo,
      body: changes.cuerpo,
      attributes: changes.atributos,
    }),
  );
};

export const deleteObjeto = (deps: ObjetosDeps, ref: string): void => {
  createRepository(deps).deleteObject(ref);
};

export const renameObjeto = (
  deps: ObjetosDeps,
  ref: string,
  nuevoTitulo: string,
): RenameReportPayload => {
  const report = createRepository(deps).renameObject(ref, nuevoTitulo);
  return {
    objeto: toPayload(report.object),
    informe: {
      reescritos: [...report.rewritten],
      omitidos: report.skipped.map((entry) => ({
        path: entry.path,
        problems: [...entry.problems],
      })),
      enlacesSinResolver: report.unresolvedLinks.map((entry) => ({
        path: entry.path,
        link: entry.link,
      })),
    },
  };
};

export const filtersOf = (params: SearchParams): ObjectFilters => ({
  tipo: params.tipo,
  carpeta: params.carpeta,
  tag: params.tag,
  desde: params.desde,
  hasta: params.hasta,
});

export const listObjetos = (
  deps: ObjetosDeps,
  params: SearchParams,
  offset: number,
): ObjetosPage => {
  const limit = params.limite ?? DEFAULT_LIST_LIMIT;
  const query = params.q?.trim() ?? "";
  const filters = filtersOf(params);
  const fetchLimit = limit + 1;
  const rows: IndexedObject[] =
    query === ""
      ? listObjectsIndexed(deps.db, { filters, limit: fetchLimit, offset })
      : searchObjects(deps.db, { query, filters, limit: fetchLimit, offset });
  const page = rows.slice(0, limit);
  const repository = createRepository(deps);
  const objetos: ObjectPayload[] = [];
  for (const row of page) {
    const payload = payloadOf(repository, row.id);
    if (payload !== undefined) {
      objetos.push(payload);
    }
  }
  const hasMore = rows.length > limit;
  return {
    objetos,
    siguienteCursor: hasMore ? encodeCursor(offset + page.length) : null,
  };
};
