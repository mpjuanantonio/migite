import { conversacionesListSchema, mensajesListSchema } from "@migite/contracts";
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

conversacionesRouter.get("/:id/mensajes", (c) =>
  c.json(mensajesListSchema.parse({ mensajes: listarMensajes(currentDeps(), c.req.param("id")) })),
);

conversacionesRouter.delete("/:id", (c) => {
  borrarConversacion(currentDeps(), c.req.param("id"));
  return c.body(null, 204);
});
