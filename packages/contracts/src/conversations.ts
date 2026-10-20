import { z } from "zod";

export const mensajeRolSchema = z.enum(["user", "assistant"]);

export type MensajeRol = z.infer<typeof mensajeRolSchema>;

export const conversacionSchema = z.strictObject({
  id: z.string(),
  titulo: z.string(),
  creada: z.string(),
});

export type Conversacion = z.infer<typeof conversacionSchema>;

export const conversacionesListSchema = z.strictObject({
  conversaciones: z.array(conversacionSchema),
});

export type ConversacionesList = z.infer<typeof conversacionesListSchema>;

export const mensajeSchema = z.strictObject({
  id: z.string(),
  rol: mensajeRolSchema,
  contenido: z.string(),
  creada: z.string(),
});

export type Mensaje = z.infer<typeof mensajeSchema>;

export const LIMITE_MENSAJES_DEFAULT = 40;

export const LIMITE_MENSAJES_MAX = 200;

export const mensajesQuerySchema = z.object({
  limite: z.coerce.number().int().min(1).max(LIMITE_MENSAJES_MAX).default(LIMITE_MENSAJES_DEFAULT),
});

export type MensajesQuery = z.infer<typeof mensajesQuerySchema>;

export const mensajesListSchema = z.strictObject({
  mensajes: z.array(mensajeSchema).max(LIMITE_MENSAJES_MAX),
});

export type MensajesList = z.infer<typeof mensajesListSchema>;
