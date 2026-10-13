import { z } from "zod";

export const fieldTypeWireSchema = z.enum([
  "texto",
  "numero",
  "fecha",
  "fecha-hora",
  "booleano",
  "seleccion",
  "multi-seleccion",
  "url",
  "referencia",
  "archivo",
]);

export type FieldTypeWire = z.infer<typeof fieldTypeWireSchema>;

export const attributeRoleWireSchema = z.enum(["estado", "vencimiento", "inicio", "fin", "hora"]);

export type AttributeRoleWire = z.infer<typeof attributeRoleWireSchema>;

const attributeId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

const nonEmptyText = z.string().trim().min(1);

export const attributePayloadSchema = z.strictObject({
  id: attributeId,
  nombre: nonEmptyText,
  tipo: fieldTypeWireSchema,
  rol: attributeRoleWireSchema.optional(),
  obligatorio: z.boolean(),
  opciones: z.array(nonEmptyText).optional(),
  referencia_a: z.array(nonEmptyText).optional(),
});

export type AttributePayload = z.infer<typeof attributePayloadSchema>;

export const presentacionSeccionSchema = z.enum(["notas", "productividad"]);

export type PresentacionSeccion = z.infer<typeof presentacionSeccionSchema>;

export const presentacionPayloadSchema = z.strictObject({
  seccion: presentacionSeccionSchema.optional(),
  carpeta: nonEmptyText.optional(),
  visible: z.boolean().optional(),
});

export type PresentacionPayload = z.infer<typeof presentacionPayloadSchema>;

export const tipoPayloadSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  descripcion: z.string().optional(),
  atributos: z.array(attributePayloadSchema),
  presentacion: presentacionPayloadSchema.optional(),
});

export type TipoPayload = z.infer<typeof tipoPayloadSchema>;
