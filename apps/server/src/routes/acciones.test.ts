import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Accion, accionesListSchema, accionSchema } from "@migite/contracts";
import { bootstrapVault, createObjectRepository, type ObjectRepository } from "@migite/core";
import { crearAccion, type IndexHandle, openIndex } from "@migite/index";
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
import { configureAcciones } from "./acciones.js";

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

const repositorio = (): ObjectRepository => createObjectRepository({ vaultDir });

const headers = (): Record<string, string> => ({ cookie: `${SESSION_COOKIE}=${token}` });

const getJson = async <T>(path: string): Promise<T> => {
  const res = await app.request(path, { headers: headers() });
  expect(res.status).toBe(200);
  return (await res.json()) as T;
};

const listar = async (query = ""): Promise<Accion[]> =>
  (await getJson<{ acciones: Accion[] }>(`/api/acciones${query}`)).acciones;

const post = async (path: string): Promise<Response> =>
  app.request(path, { method: "POST", headers: headers() });

const confirmar = (id: string): Promise<Response> => post(`/api/acciones/${id}/confirmar`);

const rechazar = (id: string): Promise<Response> => post(`/api/acciones/${id}/rechazar`);

const proponer = (tipoAccion: string, payload: unknown): ReturnType<typeof crearAccion> =>
  crearAccion(handle.db, { tipoAccion, payload });

const resultadoId = (accion: Accion): string => {
  const resultado = accion.resultado;
  if (typeof resultado !== "object" || resultado === null || !("id" in resultado)) {
    throw new Error("la acción no tiene un id de resultado");
  }
  return String((resultado as { id: unknown }).id);
};

const errorOf = async (res: Response): Promise<ErrorBody> => (await res.json()) as ErrorBody;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "migite-acciones-api-"));
  vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  bootstrapVault(vaultDir);
  handle = openIndex({ dbPath: join(root, "index.db") });
  configureAcciones({ db: handle.db, vaultDir });
  token = createSessionToken({ usuario: USUARIO, generacion: 0, secret: SECRETO });
  app = createApp({ auth });
});

afterEach(() => {
  handle.close();
  rmSync(root, { recursive: true, force: true });
});

describe("GET /api/acciones", () => {
  it("requires a session", async () => {
    const res = await app.request("/api/acciones");

    expect(res.status).toBe(401);
    expect((await errorOf(res)).error.codigo).toBe("unauthorized");
  });

  it("lists proposals newest first and filters by state", async () => {
    const primera = proponer("crear_objeto", { titulo: "Primera" });
    const segunda = proponer("borrar_objeto", { id: FALTANTE });
    expect((await rechazar(primera.id)).status).toBe(204);

    const todas = await listar();

    expect(todas.map((accion) => accion.id)).toEqual([segunda.id, primera.id]);
    expect(todas.map((accion) => accion.estado)).toEqual(["pendiente", "rechazada"]);
    expect(accionesListSchema.safeParse({ acciones: todas }).success).toBe(true);

    const pendientes = await listar("?estado=pendiente");
    expect(pendientes.map((accion) => accion.id)).toEqual([segunda.id]);
  });

  it("returns an empty list when there are no proposals", async () => {
    expect(await listar()).toEqual([]);
  });

  it("rejects an unknown state filter", async () => {
    const res = await app.request("/api/acciones?estado=desconocido", { headers: headers() });

    expect(res.status).toBe(400);
    expect((await errorOf(res)).error.codigo).toBe("validation_error");
  });
});

describe("POST /api/acciones/:id/confirmar", () => {
  it("applies a crear_objeto proposal and stores the result", async () => {
    const accion = proponer("crear_objeto", {
      tipo: "nota",
      titulo: "Nota del agente",
      cuerpo: "contenido propuesto",
      atributos: { etiquetas: ["agente"] },
      carpeta: "proyectos",
    });

    const res = await confirmar(accion.id);

    expect(res.status).toBe(200);
    const aplicada = accionSchema.parse(await res.json());
    expect(aplicada.estado).toBe("aplicada");
    const id = resultadoId(aplicada);

    const result = repositorio().readObject(id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.object.title).toBe("Nota del agente");
      expect(result.object.body).toBe("contenido propuesto");
      expect(result.object.folder).toBe("proyectos");
      expect(result.object.attributes.etiquetas).toEqual(["agente"]);
    }

    const aplicadas = await listar("?estado=aplicada");
    const persistida = aplicadas[0];
    if (persistida === undefined) {
      throw new Error("falta la acción aplicada");
    }
    expect(persistida.id).toBe(accion.id);
    expect(resultadoId(persistida)).toBe(id);
  });

  it("applies an editar_objeto proposal through the domain", async () => {
    const objeto = repositorio().createObject({ title: "Editable", body: "original" });
    const accion = proponer("editar_objeto", {
      id: objeto.id,
      cambios: { cuerpo: "cambiado" },
    });

    const res = await confirmar(accion.id);

    expect(res.status).toBe(200);
    const aplicada = accionSchema.parse(await res.json());
    expect(aplicada.estado).toBe("aplicada");
    expect(resultadoId(aplicada)).toBe(objeto.id);
    const result = repositorio().readObject(objeto.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.object.body).toBe("cambiado");
    }
  });

  it("applies a borrar_objeto proposal only after the confirmation", async () => {
    const objeto = repositorio().createObject({ title: "Borrable" });
    const accion = proponer("borrar_objeto", { id: objeto.id });
    expect(repositorio().readObject(objeto.id).ok).toBe(true);

    const res = await confirmar(accion.id);

    expect(res.status).toBe(200);
    const aplicada = accionSchema.parse(await res.json());
    expect(aplicada.estado).toBe("aplicada");
    expect(resultadoId(aplicada)).toBe(objeto.id);
    expect(() => repositorio().readObject(objeto.id)).toThrow();
  });

  it("marks the proposal as error with a sanitized detail when applying fails", async () => {
    const accion = proponer("borrar_objeto", { id: FALTANTE });

    const res = await confirmar(accion.id);

    expect(res.status).toBe(404);
    expect((await errorOf(res)).error.codigo).toBe("object_not_found");
    const fallidas = await listar("?estado=error");
    const fallida = fallidas[0];
    if (fallida === undefined) {
      throw new Error("falta la acción fallida");
    }
    expect(fallida.id).toBe(accion.id);
    expect(fallida.detalle).toBeTruthy();
    expect(fallida.detalle).not.toContain(root);
    expect(fallida.detalle).not.toContain(vaultDir);
  });

  it("marks the proposal as error when the stored payload does not match its type", async () => {
    const accion = proponer("crear_objeto", { sinTitulo: true });

    const res = await confirmar(accion.id);

    expect(res.status).toBe(400);
    expect((await errorOf(res)).error.codigo).toBe("validation_error");
    const fallidas = await listar("?estado=error");
    expect(fallidas.map((fallida) => fallida.id)).toEqual([accion.id]);
    expect(fallidas[0]?.detalle).toBeTruthy();
  });

  it("answers 409 when the proposal was already confirmed", async () => {
    const accion = proponer("crear_objeto", { titulo: "Una sola vez" });
    expect((await confirmar(accion.id)).status).toBe(200);

    const res = await confirmar(accion.id);

    expect(res.status).toBe(409);
    expect((await errorOf(res)).error.codigo).toBe("action_conflict");
  });

  it("answers 404 for an unknown proposal", async () => {
    const res = await confirmar(FALTANTE);

    expect(res.status).toBe(404);
    expect((await errorOf(res)).error.codigo).toBe("action_not_found");
  });
});

describe("POST /api/acciones/:id/rechazar", () => {
  it("rejects a proposal without touching the vault", async () => {
    const objeto = repositorio().createObject({ title: "Intacto" });
    const accion = proponer("borrar_objeto", { id: objeto.id });

    const res = await rechazar(accion.id);

    expect(res.status).toBe(204);
    const rechazadas = await listar("?estado=rechazada");
    expect(rechazadas.map((rechazada) => rechazada.id)).toEqual([accion.id]);
    expect(repositorio().readObject(objeto.id).ok).toBe(true);
  });

  it("answers 409 when the proposal was already rejected", async () => {
    const accion = proponer("crear_objeto", { titulo: "Rechazable" });
    expect((await rechazar(accion.id)).status).toBe(204);

    const res = await rechazar(accion.id);

    expect(res.status).toBe(409);
    expect((await errorOf(res)).error.codigo).toBe("action_conflict");
  });

  it("answers 404 for an unknown proposal", async () => {
    const res = await rechazar(FALTANTE);

    expect(res.status).toBe(404);
    expect((await errorOf(res)).error.codigo).toBe("action_not_found");
  });
});
