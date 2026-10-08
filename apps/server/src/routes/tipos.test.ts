import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ObjectPayload,
  objectPayloadSchema,
  type SearchResults,
  searchResultsSchema,
  type TipoPayload,
  tipoPayloadSchema,
  tiposListSchema,
} from "@migite/contracts";
import { bootstrapVault, writeObjectFile } from "@migite/core";
import { buildIndex, type IndexHandle, openIndex } from "@migite/index";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import {
  type AuthOptions,
  createSessionToken,
  createStaticSessionStore,
  SESSION_COOKIE,
} from "../auth.js";
import type { ServerEnv } from "../env.js";
import { configureBuscar } from "./buscar.js";
import { configureObjetos } from "./objetos.js";
import { configureTipos } from "./tipos.js";

const USUARIO = "ana";
const SECRETO = "secreto-de-test-suficientemente-largo";

const NATIVOS = ["evento", "nota", "proyecto", "recordatorio", "tarea"];

const LIBRO: TipoPayload = {
  id: "libro",
  nombre: "Libro",
  descripcion: "Libros de la biblioteca",
  atributos: [
    { id: "titulo", nombre: "Título", tipo: "texto", obligatorio: true },
    { id: "autor", nombre: "Autor", tipo: "texto", obligatorio: false },
  ],
};

const OBJETO = "01JLIBRO0000000000000000000";

type TiposBody = {
  readonly tipos: TipoPayload[];
};

type ErrorBody = {
  readonly error: { readonly codigo: string; readonly mensaje: string };
};

const auth: AuthOptions = {
  store: createStaticSessionStore({
    usuario: USUARIO,
    passwordHash: "$argon2id$test",
    secretoSesion: SECRETO,
  }),
};

let root: string;
let vaultDir: string;
let tiposDir: string;
let handle: IndexHandle;
let app: Hono<ServerEnv>;
let token: string;

const headers = (): Record<string, string> => ({ cookie: `${SESSION_COOKIE}=${token}` });

const getJson = async <T>(path: string): Promise<T> => {
  const res = await app.request(path, { headers: headers() });
  expect(res.status).toBe(200);
  return (await res.json()) as T;
};

const sendJson = async (method: string, path: string, payload: unknown): Promise<Response> =>
  app.request(path, {
    method,
    headers: { ...headers(), "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

const writeLibroObject = (): void => {
  const text = writeObjectFile(
    {
      id: OBJETO,
      type: "libro",
      title: "El Quijote",
      created: "2026-10-01T09:00:00.000+02:00",
      updated: "2026-10-01T09:00:00.000+02:00",
      links: [],
      attributes: {},
    },
    "Un clásico de la literatura.",
  );
  writeFileSync(join(vaultDir, "el-quijote.md"), text, "utf8");
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "migite-tipos-"));
  vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  bootstrapVault(vaultDir);
  tiposDir = join(vaultDir, "tipos");
  handle = openIndex({ dbPath: join(root, "index.db") });
  buildIndex(handle.db, { vaultDir });
  configureTipos({ tiposDir });
  configureObjetos({ db: handle.db, vaultDir });
  configureBuscar({ db: handle.db });
  token = createSessionToken({ usuario: USUARIO, generacion: 0, secret: SECRETO });
  app = createApp({ auth });
});

afterEach(() => {
  handle.close();
  rmSync(root, { recursive: true, force: true });
});

describe("GET /api/tipos", () => {
  it("returns the list envelope validated against the shared schema", async () => {
    const res = await app.request("/api/tipos", { headers: headers() });

    expect(res.status).toBe(200);
    const body = tiposListSchema.parse(await res.json());
    expect(body.tipos.map((tipo) => tipo.id)).toEqual(NATIVOS);
  });

  it("lists the native types as consultable payloads", async () => {
    const body = await getJson<TiposBody>("/api/tipos");

    expect(body.tipos.map((tipo) => tipo.id)).toEqual(NATIVOS);
    for (const tipo of body.tipos) {
      expect(tipoPayloadSchema.parse(tipo)).toEqual(tipo);
    }
  });

  it("requires a valid session", async () => {
    const res = await app.request("/api/tipos");
    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrorBody).error.codigo).toBe("unauthorized");
  });
});

describe("POST /api/tipos", () => {
  it("creates a custom type and lists it afterwards", async () => {
    const res = await sendJson("POST", "/api/tipos", LIBRO);

    expect(res.status).toBe(201);
    const created = tipoPayloadSchema.parse(await res.json());
    expect(created).toEqual(LIBRO);
    expect(existsSync(join(tiposDir, "libro.yaml"))).toBe(true);

    const list = await getJson<TiposBody>("/api/tipos");
    expect(list.tipos.map((tipo) => tipo.id)).toEqual([
      "evento",
      "libro",
      "nota",
      "proyecto",
      "recordatorio",
      "tarea",
    ]);
    expect(list.tipos.find((tipo) => tipo.id === "libro")).toEqual(LIBRO);
  });

  it("rejects reserved ids with type_not_editable", async () => {
    const res = await sendJson("POST", "/api/tipos", {
      id: "nota",
      nombre: "Otra nota",
      atributos: [],
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.codigo).toBe("type_not_editable");
    expect(body.error.mensaje).toContain("nota");
    expect(existsSync(join(tiposDir, "nota.yaml"))).toBe(true);
  });

  it("rejects duplicated ids with type_already_exists", async () => {
    expect((await sendJson("POST", "/api/tipos", LIBRO)).status).toBe(201);

    const res = await sendJson("POST", "/api/tipos", LIBRO);

    expect(res.status).toBe(409);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.codigo).toBe("type_already_exists");
    expect(body.error.mensaje).toContain("libro");
    expect(readFileSync(join(tiposDir, "libro.yaml"), "utf8")).toContain("nombre: Libro");
  });

  it("rejects malformed definitions with validation_error", async () => {
    const res = await sendJson("POST", "/api/tipos", { id: "libro" });

    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.codigo).toBe("validation_error");
  });

  it("requires a valid session", async () => {
    const res = await app.request("/api/tipos", { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/tipos/:id", () => {
  it("adds an attribute with the complete list", async () => {
    expect((await sendJson("POST", "/api/tipos", LIBRO)).status).toBe(201);

    const res = await sendJson("PATCH", "/api/tipos/libro", {
      nombre: "Libro de la biblioteca",
      atributos: [
        { id: "titulo", nombre: "Título", tipo: "texto", obligatorio: true },
        { id: "autor", nombre: "Autor", tipo: "texto", obligatorio: false },
        { id: "anio", nombre: "Año", tipo: "numero", obligatorio: false },
      ],
    });

    expect(res.status).toBe(200);
    const updated = tipoPayloadSchema.parse(await res.json());
    expect(updated.nombre).toBe("Libro de la biblioteca");
    expect(updated.atributos.map((attribute) => attribute.id)).toEqual(["titulo", "autor", "anio"]);

    const list = await getJson<TiposBody>("/api/tipos");
    expect(list.tipos.find((tipo) => tipo.id === "libro")).toEqual(updated);
  });

  it("rejects changing the type of an existing attribute and keeps the file intact", async () => {
    expect((await sendJson("POST", "/api/tipos", LIBRO)).status).toBe(201);
    const path = join(tiposDir, "libro.yaml");
    const before = readFileSync(path, "utf8");

    const res = await sendJson("PATCH", "/api/tipos/libro", {
      atributos: [
        { id: "titulo", nombre: "Título", tipo: "numero", obligatorio: true },
        { id: "autor", nombre: "Autor", tipo: "texto", obligatorio: false },
      ],
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.codigo).toBe("attribute_type_immutable");
    expect(body.error.mensaje).toContain("titulo");
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("rejects reserved ids with type_not_editable", async () => {
    const res = await sendJson("PATCH", "/api/tipos/nota", { nombre: "Otra nota" });

    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorBody).error.codigo).toBe("type_not_editable");
  });

  it("answers type_not_found for unknown types", async () => {
    const res = await sendJson("PATCH", "/api/tipos/fantasma", { nombre: "Fantasma" });

    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorBody).error.codigo).toBe("type_not_found");
  });

  it("rejects malformed bodies with validation_error", async () => {
    const res = await sendJson("PATCH", "/api/tipos/libro", { atributos: "no-es-una-lista" });

    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.codigo).toBe("validation_error");
  });

  it("requires a valid session", async () => {
    const res = await app.request("/api/tipos/libro", { method: "PATCH" });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/tipos/:id", () => {
  it("requires explicit confirmation and keeps the type", async () => {
    expect((await sendJson("POST", "/api/tipos", LIBRO)).status).toBe(201);

    const res = await app.request("/api/tipos/libro", { method: "DELETE", headers: headers() });

    expect(res.status).toBe(409);
    expect(((await res.json()) as ErrorBody).error.codigo).toBe("confirmation_required");
    expect(existsSync(join(tiposDir, "libro.yaml"))).toBe(true);
    const list = await getJson<TiposBody>("/api/tipos");
    expect(list.tipos.map((tipo) => tipo.id)).toContain("libro");
  });

  it("deletes a custom type and degrades its objects", async () => {
    expect((await sendJson("POST", "/api/tipos", LIBRO)).status).toBe(201);
    writeLibroObject();
    expect((await getJson<ObjectPayload>(`/api/objetos/${OBJETO}`)).degraded).toEqual([]);

    const res = await app.request("/api/tipos/libro?confirmar=1", {
      method: "DELETE",
      headers: headers(),
    });

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(existsSync(join(tiposDir, "libro.yaml"))).toBe(false);

    const degraded = objectPayloadSchema.parse(
      await getJson<ObjectPayload>(`/api/objetos/${OBJETO}`),
    );
    expect(degraded.degraded).toEqual([{ kind: "unknownType", type: "libro" }]);
  });

  it("rejects reserved ids before asking for confirmation", async () => {
    const res = await app.request("/api/tipos/nota", { method: "DELETE", headers: headers() });

    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorBody).error.codigo).toBe("type_not_editable");
    expect(existsSync(join(tiposDir, "nota.yaml"))).toBe(true);
  });

  it("answers type_not_found for unknown types", async () => {
    const res = await app.request("/api/tipos/fantasma?confirmar=1", {
      method: "DELETE",
      headers: headers(),
    });

    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorBody).error.codigo).toBe("type_not_found");
  });

  it("requires a valid session", async () => {
    const res = await app.request("/api/tipos/libro", { method: "DELETE" });
    expect(res.status).toBe(401);
  });
});

describe("wiring del runtime", () => {
  it("serves the search endpoint once configured like the real app", async () => {
    const body = await getJson<SearchResults>("/api/buscar");

    expect(searchResultsSchema.parse(body)).toEqual({ resultados: [], siguienteCursor: null });
  });
});
