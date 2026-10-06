import { tipoPayloadSchema } from "@migite/contracts";
import { isReservedTypeId, TypeOperationError } from "@migite/core";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ServerEnv } from "../env.js";
import { confirmationRequired } from "../services/objetos.js";
import {
  actualizarTipo,
  crearTipo,
  eliminarTipo,
  listarTipos,
  type TiposDeps,
} from "../services/tipos.js";

let deps: TiposDeps | undefined;

export const configureTipos = (next: TiposDeps): void => {
  deps = next;
};

const currentDeps = (): TiposDeps => {
  if (deps === undefined) {
    throw new Error("el runtime de tipos no está configurado");
  }
  return deps;
};

const readJson = async (c: Context<ServerEnv>): Promise<unknown> => {
  try {
    return await c.req.json();
  } catch {
    throw new HTTPException(400);
  }
};

const patchTipoBodySchema = tipoPayloadSchema.omit({ id: true }).partial();

export const tiposRouter = new Hono<ServerEnv>();

tiposRouter.get("/", (c) => c.json({ tipos: listarTipos(currentDeps()) }));

tiposRouter.post("/", async (c) => {
  const body = tipoPayloadSchema.parse(await readJson(c));
  return c.json(crearTipo(currentDeps(), body), 201);
});

tiposRouter.patch("/:id", async (c) => {
  const body = patchTipoBodySchema.parse(await readJson(c));
  return c.json(actualizarTipo(currentDeps(), c.req.param("id"), body));
});

tiposRouter.delete("/:id", (c) => {
  const id = c.req.param("id");
  if (isReservedTypeId(id)) {
    throw new TypeOperationError("error.typeNotEditable", { id });
  }
  if (c.req.query("confirmar") !== "1") {
    throw confirmationRequired();
  }
  eliminarTipo(currentDeps(), id);
  return c.body(null, 204);
});
