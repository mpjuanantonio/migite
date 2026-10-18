import {
  conversacionesListSchema,
  mensajesListSchema,
  mensajesQuerySchema,
} from "@migite/contracts";
import { Hono } from "hono";
import type { ServerEnv } from "../env.js";
import {
  borrarConversacion,
  type ConversationsDeps,
  listarConversaciones,
  listarMensajes,
} from "../services/conversations.js";

let deps: ConversationsDeps | undefined;

export const configureConversaciones = (next: ConversationsDeps): void => {
  deps = next;
};

const currentDeps = (): ConversationsDeps => {
  if (deps === undefined) {
    throw new Error("el runtime de conversaciones no está configurado");
  }
  return deps;
};

export const conversacionesRouter = new Hono<ServerEnv>();

conversacionesRouter.get("/", (c) =>
  c.json(conversacionesListSchema.parse({ conversaciones: listarConversaciones(currentDeps()) })),
);

conversacionesRouter.get("/:id/mensajes", (c) => {
  const { limite } = mensajesQuerySchema.parse(c.req.query());
  const mensajes = listarMensajes(currentDeps(), c.req.param("id")).slice(-limite);
  return c.json(mensajesListSchema.parse({ mensajes }));
});

conversacionesRouter.delete("/:id", (c) => {
  borrarConversacion(currentDeps(), c.req.param("id"));
  return c.body(null, 204);
});
