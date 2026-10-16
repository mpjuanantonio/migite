import { z } from "zod";
import { accionSchema } from "./acciones.js";

export const LIMITE_MENSAJE_CHAT = 4000;

export const LIMITE_HISTORIAL_CHAT = 40;

export const chatHistorialMensajeSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type ChatHistorialMensaje = z.infer<typeof chatHistorialMensajeSchema>;

export const chatMensajeBodySchema = z.strictObject({
  mensaje: z.string().trim().min(1).max(LIMITE_MENSAJE_CHAT),
  historial: z.array(chatHistorialMensajeSchema).max(LIMITE_HISTORIAL_CHAT).optional(),
});

export type ChatMensajeBody = z.infer<typeof chatMensajeBodySchema>;

export const chatRunEstadoSchema = z.enum(["completado", "limite", "error"]);

export type ChatRunEstado = z.infer<typeof chatRunEstadoSchema>;

export const chatStreamEventSchema = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("delta"), texto: z.string() }),
  z.strictObject({ tipo: z.literal("herramienta"), nombre: z.string(), isError: z.boolean() }),
  z.strictObject({
    tipo: z.literal("fin"),
    contenido: z.string(),
    pasos: z.number().int().nonnegative(),
    estado: chatRunEstadoSchema,
    accionesPropuestas: z.array(accionSchema),
  }),
  z.strictObject({ tipo: z.literal("error"), mensaje: z.string() }),
]);

export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
