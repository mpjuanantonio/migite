import { z } from "zod";
import { objectPayloadSchema } from "./objetos.js";
import { tipoPayloadSchema } from "./tipos.js";

export const objetosPageSchema = z.object({
  objetos: z.array(objectPayloadSchema),
  siguienteCursor: z.string().nullable(),
});

export type ObjetosPage = z.infer<typeof objetosPageSchema>;

export const tiposListSchema = z.object({
  tipos: z.array(tipoPayloadSchema),
});

export type TiposList = z.infer<typeof tiposListSchema>;

export const sesionStatusSchema = z.object({
  autenticado: z.boolean(),
});

export type SesionStatus = z.infer<typeof sesionStatusSchema>;

export const saludSchema = z.object({
  status: z.enum(["ok", "degradado"]),
  indice: z.object({
    objetos: z.number().int(),
    listo: z.boolean(),
    ultimoError: z.string().nullable(),
  }),
  version: z.string().optional(),
});

export type Salud = z.infer<typeof saludSchema>;
