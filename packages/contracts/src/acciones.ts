import { z } from "zod";
import { createObjectBodySchema, patchObjectBodySchema } from "./objetos.js";

const nonEmptyText = z.string().trim().min(1);

export const ESTADOS_ACCION = ["pendiente", "aplicada", "rechazada", "error"] as const;

export const accionEstadoSchema = z.enum(ESTADOS_ACCION);

export type EstadoAccion = z.infer<typeof accionEstadoSchema>;

export const tipoAccionSchema = z.enum(["crear_objeto", "editar_objeto", "borrar_objeto"]);

export type TipoAccion = z.infer<typeof tipoAccionSchema>;

export const crearObjetoPayloadSchema = createObjectBodySchema;

export type CrearObjetoPayload = z.infer<typeof crearObjetoPayloadSchema>;

export const editarObjetoPayloadSchema = z.strictObject({
  id: nonEmptyText,
  cambios: patchObjectBodySchema,
});

export type EditarObjetoPayload = z.infer<typeof editarObjetoPayloadSchema>;

export const borrarObjetoPayloadSchema = z.strictObject({
  id: nonEmptyText,
});

export type BorrarObjetoPayload = z.infer<typeof borrarObjetoPayloadSchema>;

const accionShape = {
  id: z.string(),
  estado: accionEstadoSchema,
  creada: z.string(),
  detalle: z.string().optional(),
  resultado: z.unknown().optional(),
};

export const accionPropuestaSchema = z.discriminatedUnion("tipoAccion", [
  z.object({
    ...accionShape,
    tipoAccion: z.literal("crear_objeto"),
    payload: crearObjetoPayloadSchema,
  }),
  z.object({
    ...accionShape,
    tipoAccion: z.literal("editar_objeto"),
    payload: editarObjetoPayloadSchema,
  }),
  z.object({
    ...accionShape,
    tipoAccion: z.literal("borrar_objeto"),
    payload: borrarObjetoPayloadSchema,
  }),
]);

export type AccionPropuesta = z.infer<typeof accionPropuestaSchema>;

const accionDesconocidaSchema = z.object({
  ...accionShape,
  tipoAccion: z.string(),
  payload: z.unknown(),
});

export const accionSchema = z.union([accionPropuestaSchema, accionDesconocidaSchema]);

export type Accion = z.infer<typeof accionSchema>;

export const accionesListSchema = z.object({
  acciones: z.array(accionSchema),
});

export type AccionesList = z.infer<typeof accionesListSchema>;
