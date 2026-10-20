import { z } from "zod";
import { createObjectBodySchema, patchObjectBodySchema } from "./objetos.js";
import { attributePayloadSchema, identifierSchema, presentacionPayloadSchema } from "./tipos.js";

const nonEmptyText = z.string().trim().min(1);

export const ESTADOS_ACCION = ["pendiente", "aplicada", "rechazada", "error"] as const;

export const accionEstadoSchema = z.enum(ESTADOS_ACCION);

export type EstadoAccion = z.infer<typeof accionEstadoSchema>;

export const tipoAccionSchema = z.enum([
  "crear_objeto",
  "editar_objeto",
  "borrar_objeto",
  "guardar_memoria",
  "crear_tipo",
]);

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

export const guardarMemoriaPayloadSchema = z.strictObject({
  clave: nonEmptyText.max(100),
  contenido: nonEmptyText.max(4000),
});

export type GuardarMemoriaPayload = z.infer<typeof guardarMemoriaPayloadSchema>;

export const crearTipoPayloadSchema = z.strictObject({
  id: identifierSchema.optional(),
  nombre: nonEmptyText,
  descripcion: z.string().max(1000).optional(),
  atributos: z.array(attributePayloadSchema).max(64),
  presentacion: presentacionPayloadSchema.optional(),
});

export type CrearTipoPayload = z.infer<typeof crearTipoPayloadSchema>;

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
  z.object({
    ...accionShape,
    tipoAccion: z.literal("guardar_memoria"),
    payload: guardarMemoriaPayloadSchema,
  }),
  z.object({
    ...accionShape,
    tipoAccion: z.literal("crear_tipo"),
    payload: crearTipoPayloadSchema,
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
