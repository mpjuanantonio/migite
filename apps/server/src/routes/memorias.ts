import { actualizarMemoriaBodySchema, memoriaSchema, memoriasListSchema } from "@migite/contracts";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ServerEnv } from "../env.js";
import {
  actualizarMemoria,
  borrarMemoria,
  listarMemorias,
  type MemoriasDeps,
} from "../services/memories.js";

let deps: MemoriasDeps | undefined;

export const configureMemorias = (next: MemoriasDeps): void => {
  deps = next;
};

const currentDeps = (): MemoriasDeps => {
  if (deps === undefined) {
    throw new Error("el runtime de memorias no está configurado");
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

export const memoriasRouter = new Hono<ServerEnv>();

memoriasRouter.get("/", (c) =>
  c.json(memoriasListSchema.parse({ memorias: listarMemorias(currentDeps()) })),
);

memoriasRouter.patch("/:id", async (c) => {
  const body = actualizarMemoriaBodySchema.parse(await readJson(c));
  return c.json(
    memoriaSchema.parse(actualizarMemoria(currentDeps(), c.req.param("id"), body.contenido)),
  );
});

memoriasRouter.delete("/:id", (c) => {
  borrarMemoria(currentDeps(), c.req.param("id"));
  return c.body(null, 204);
});
