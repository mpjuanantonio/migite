import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Conversacion,
  conversacionesListSchema,
  type Mensaje,
  mensajesListSchema,
} from "@migite/contracts";
import { bootstrapVault } from "@migite/core";
import { crearConversacion, guardarMensaje, type IndexHandle, openIndex } from "@migite/index";
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
import { configureConversaciones } from "./conversaciones.js";

const USUARIO = "ana";
const SECRETO = "secreto-de-test-suficientemente-largo";

const FALTANTE = "01JCONVERSACION0000000000000";

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

const getJson = async <T>(path: string): Promise<T> => {
  const res = await app.request(path, { headers: headers() });
  expect(res.status).toBe(200);
  return (await res.json()) as T;
};

const listar = async (): Promise<Conversacion[]> =>
  conversacionesListSchema.parse(await getJson("/api/conversaciones")).conversaciones;

const transcript = async (id: string): Promise<Mensaje[]> =>
  mensajesListSchema.parse(await getJson(`/api/conversaciones/${id}/mensajes`)).mensajes;

const borrar = (id: string): Promise<Response> =>
  Promise.resolve(
    app.request(`/api/conversaciones/${id}`, { method: "DELETE", headers: headers() }),
  );

const errorOf = async (res: Response): Promise<ErrorBody> => (await res.json()) as ErrorBody;

const sembrar = (titulo: string, mensajes: readonly [Mensaje["rol"], string][]): Conversacion => {
  const conversacion = crearConversacion(handle.db, { titulo });
  for (const [rol, contenido] of mensajes) {
    guardarMensaje(handle.db, { conversacionId: conversacion.id, rol, contenido });
  }
  return conversacion;
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "migite-conversaciones-api-"));
  vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  bootstrapVault(vaultDir);
  handle = openIndex({ dbPath: join(root, "index.db") });
  configureConversaciones({ db: handle.db });
  token = createSessionToken({ usuario: USUARIO, generacion: 0, secret: SECRETO });
  app = createApp({ auth });
});

afterEach(() => {
  handle.close();
  rmSync(root, { recursive: true, force: true });
});

describe("GET /api/conversaciones", () => {
  it("requires a session", async () => {
    const res = await app.request("/api/conversaciones");

    expect(res.status).toBe(401);
    expect((await errorOf(res)).error.codigo).toBe("unauthorized");
  });

  it("returns an empty list when there are no conversations", async () => {
    expect(await listar()).toEqual([]);
  });

  it("lists conversations newest first", async () => {
    const primera = sembrar("Primera", []);
    const segunda = sembrar("Segunda", []);

    const conversaciones = await listar();

    expect(conversaciones.map((conversacion) => conversacion.id)).toEqual([segunda.id, primera.id]);
    expect(conversaciones.map((conversacion) => conversacion.titulo)).toEqual([
      "Segunda",
      "Primera",
    ]);
  });
});

describe("GET /api/conversaciones/:id/mensajes", () => {
  it("returns the transcript in order", async () => {
    const conversacion = sembrar("Con historial", [
      ["user", "hola"],
      ["assistant", "buenas"],
    ]);

    expect(await transcript(conversacion.id)).toEqual([
      expect.objectContaining({ rol: "user", contenido: "hola" }),
      expect.objectContaining({ rol: "assistant", contenido: "buenas" }),
    ]);
  });

  it("answers 404 for an unknown conversation", async () => {
    const res = await app.request(`/api/conversaciones/${FALTANTE}/mensajes`, {
      headers: headers(),
    });

    expect(res.status).toBe(404);
    expect((await errorOf(res)).error.codigo).toBe("conversation_not_found");
  });
});

describe("DELETE /api/conversaciones/:id", () => {
  it("deletes the conversation and its messages", async () => {
    const conversacion = sembrar("Borrable", [
      ["user", "hola"],
      ["assistant", "buenas"],
    ]);

    const res = await borrar(conversacion.id);

    expect(res.status).toBe(204);
    expect(await listar()).toEqual([]);
    const missing = await app.request(`/api/conversaciones/${conversacion.id}/mensajes`, {
      headers: headers(),
    });
    expect(missing.status).toBe(404);
  });

  it("answers 404 for an unknown conversation", async () => {
    const res = await borrar(FALTANTE);

    expect(res.status).toBe(404);
    expect((await errorOf(res)).error.codigo).toBe("conversation_not_found");
  });
});
