import { searchParamsSchema, searchResultsSchema } from "@migite/contracts";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ServerEnv } from "../env.js";
import { type BuscarDeps, buscar } from "../services/buscar.js";
import { decodeCursor, MAX_LIST_OFFSET } from "../services/objetos.js";

let deps: BuscarDeps | undefined;

export const configureBuscar = (next: BuscarDeps): void => {
  deps = next;
};

const currentDeps = (): BuscarDeps => {
  if (deps === undefined) {
    throw new Error("el runtime de búsqueda no está configurado");
  }
  return deps;
};

export const buscarRouter = new Hono<ServerEnv>();

buscarRouter.get("/", (c) => {
  const params = searchParamsSchema.parse(c.req.query());
  const offset = params.cursor === undefined ? 0 : decodeCursor(params.cursor);
  if (offset === undefined || offset > MAX_LIST_OFFSET) {
    throw new HTTPException(400);
  }
  return c.json(searchResultsSchema.parse(buscar(currentDeps(), params, offset)));
});
