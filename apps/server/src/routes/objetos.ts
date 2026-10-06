import { searchParamsSchema } from "@migite/contracts";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ServerEnv } from "../env.js";
import { decodeCursor, getObjeto, listObjetos, type ObjetosDeps } from "../services/objetos.js";

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

export const objetosRouter = new Hono<ServerEnv>();

objetosRouter.get("/", (c) => {
  const params = searchParamsSchema.parse(c.req.query());
  const offset = params.cursor === undefined ? 0 : decodeCursor(params.cursor);
  if (offset === undefined) {
    throw new HTTPException(400);
  }
  return c.json(listObjetos(currentDeps(), params, offset));
});

objetosRouter.get("/:id", (c) => c.json(getObjeto(currentDeps(), c.req.param("id"))));
