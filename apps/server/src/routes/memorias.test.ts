import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Memoria, memoriaSchema } from "@migite/contracts";
import { bootstrapVault } from "@migite/core";
import { guardarMemoria, type IndexHandle, listarMemorias, openIndex } from "@migite/index";
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
import { configureMemorias } from "./memorias.js";

const USUARIO = "ana";
const SECRETO = "secreto-de-test-suficientemente-largo";

const FALTANTE = "01JXK2P4R5S6T7U8V9W0X1Y2Z";

const auth: AuthOptions = {
  store: createStaticSessionStore({
    usuario: USUARIO,
    passwordHash: "$argon2id$test",
    secretoSesion: SECRETO,
  }),
};

type ErrorBody = {
  readonly error: { readonly codigo: string; readonly mensaje: string };
};

let root: string;
let vaultDir: string;
let handle: IndexHandle;
let app: Hono<ServerEnv>;
let token: string;

const headers = (): Record<string, string> => ({ cookie: `${SESSION_COOKIE}=${token}` });

const listar = async (): Promise<Memoria[]> => {
  const res = await app.request("/api/memorias", { headers: headers() });
  expect(res.status).toBe(200);
  return ((await res.json()) as { memorias: Memoria[] }).memorias;
};

const patch = async (id: string, body: unknown): Promise<Response> =>
  app.request(`/api/memorias/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers() },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const borrar = async (id: string): Promise<Response> =>
  app.request(`/api/memorias/${id}`, { method: "DELETE", headers: headers() });

const errorOf = async (res: Response): Promise<ErrorBody> => (await res.json()) as ErrorBody;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "migite-memorias-api-"));
  vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  bootstrapVault(vaultDir);
  handle = openIndex({ dbPath: join(root, "index.db") });
  configureMemorias({ db: handle.db });
  token = createSessionToken({ usuario: USUARIO, generacion: 0, secret: SECRETO });
  app = createApp({ auth });
});

afterEach(() => {
  handle.close();
  rmSync(root, { recursive: true, force: true });
});

describe("GET /api/memorias", () => {
  it("requiere sesión", async () => {
    const res = await app.request("/api/memorias");

    expect(res.status).toBe(401);
    expect((await errorOf(res)).error.codigo).toBe("unauthorized");
  });

  it("lista las memorias guardadas", async () => {
    guardarMemoria(handle.db, { clave: "ciudad", contenido: "Sevilla" });
    guardarMemoria(handle.db, { clave: "color", contenido: "azul" });

    const memorias = await listar();

    expect(memorias.map((memoria) => [memoria.clave, memoria.contenido])).toEqual([
      ["ciudad", "Sevilla"],
      ["color", "azul"],
    ]);
    expect(memoriaSchema.safeParse(memorias[0]).success).toBe(true);
  });

  it("devuelve una lista vacía sin memorias", async () => {
    expect(await listar()).toEqual([]);
  });
});

describe("PATCH /api/memorias/:id", () => {
  it("actualiza el contenido de una memoria", async () => {
    const memoria = guardarMemoria(handle.db, { clave: "ciudad", contenido: "Sevilla" });

    const res = await patch(memoria.id, { contenido: "Granada" });

    expect(res.status).toBe(200);
    const actualizada = memoriaSchema.parse(await res.json());
    expect(actualizada.id).toBe(memoria.id);
    expect(actualizada.clave).toBe("ciudad");
    expect(actualizada.contenido).toBe("Granada");
    expect((await listar())[0]?.contenido).toBe("Granada");
  });

  it("responde 404 si la memoria no existe", async () => {
    const res = await patch(FALTANTE, { contenido: "algo" });

    expect(res.status).toBe(404);
    expect((await errorOf(res)).error.codigo).toBe("memory_not_found");
  });

  it("responde 400 con un contenido vacío y no modifica nada", async () => {
    const memoria = guardarMemoria(handle.db, { clave: "ciudad", contenido: "Sevilla" });

    const res = await patch(memoria.id, { contenido: "   " });

    expect(res.status).toBe(400);
    expect((await errorOf(res)).error.codigo).toBe("validation_error");
    expect((await listar())[0]?.contenido).toBe("Sevilla");
  });

  it("responde 400 con campos extra o JSON inválido", async () => {
    const memoria = guardarMemoria(handle.db, { clave: "ciudad", contenido: "Sevilla" });

    expect((await patch(memoria.id, { contenido: "Granada", clave: "otra" })).status).toBe(400);
    expect((await patch(memoria.id, "{")).status).toBe(400);
  });

  it("requiere sesión", async () => {
    const memoria = guardarMemoria(handle.db, { clave: "ciudad", contenido: "Sevilla" });

    const res = await app.request(`/api/memorias/${memoria.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contenido: "Granada" }),
    });

    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/memorias/:id", () => {
  it("borra la memoria y responde 204", async () => {
    const memoria = guardarMemoria(handle.db, { clave: "ciudad", contenido: "Sevilla" });

    const res = await borrar(memoria.id);

    expect(res.status).toBe(204);
    expect(await listar()).toEqual([]);
    expect(listarMemorias(handle.db)).toEqual([]);
  });

  it("responde 404 si la memoria no existe", async () => {
    const res = await borrar(FALTANTE);

    expect(res.status).toBe(404);
    expect((await errorOf(res)).error.codigo).toBe("memory_not_found");
  });

  it("requiere sesión", async () => {
    const memoria = guardarMemoria(handle.db, { clave: "ciudad", contenido: "Sevilla" });

    const res = await app.request(`/api/memorias/${memoria.id}`, { method: "DELETE" });

    expect(res.status).toBe(401);
  });
});
