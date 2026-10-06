import {
  createObjectBodySchema,
  patchObjectBodySchema,
  renameObjectBodySchema,
  searchParamsSchema,
} from "@migite/contracts";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ServerEnv } from "../env.js";
import {
  confirmationRequired,
  createObjeto,
  decodeCursor,
  deleteObjeto,
  getObjeto,
  listObjetos,
  MAX_LIST_OFFSET,
  type ObjetosDeps,
  patchObjeto,
  renameObjeto,
} from "../services/objetos.js";

let deps: ObjetosDeps | undefined;

export const configureObjetos = (next: ObjetosDeps): void => {
  deps = next;
};

const currentDeps = (): ObjetosDeps => {
  if (deps === undefined) {
    throw new Error("el runtime de objetos no está configurado");
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

export const objetosRouter = new Hono<ServerEnv>();

objetosRouter.get("/", (c) => {
  const params = searchParamsSchema.parse(c.req.query());
  const offset = params.cursor === undefined ? 0 : decodeCursor(params.cursor);
  if (offset === undefined || offset > MAX_LIST_OFFSET) {
    throw new HTTPException(400);
  }
  return c.json(listObjetos(currentDeps(), params, offset));
});

objetosRouter.get("/:id", (c) => c.json(getObjeto(currentDeps(), c.req.param("id"))));

objetosRouter.post("/", async (c) => {
  const body = createObjectBodySchema.parse(await readJson(c));
  return c.json(createObjeto(currentDeps(), body), 201);
});

objetosRouter.patch("/:id", async (c) => {
  const body = patchObjectBodySchema.parse(await readJson(c));
  return c.json(patchObjeto(currentDeps(), c.req.param("id"), body));
});

objetosRouter.delete("/:id", (c) => {
  if (c.req.query("confirmar") !== "1") {
    throw confirmationRequired();
  }
  deleteObjeto(currentDeps(), c.req.param("id"));
  return c.body(null, 204);
});

objetosRouter.post("/:id/renombrar", async (c) => {
  const body = renameObjectBodySchema.parse(await readJson(c));
  return c.json(renameObjeto(currentDeps(), c.req.param("id"), body.nuevoTitulo));
});
