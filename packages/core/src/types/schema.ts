import { type ZodError, z } from "zod";
import {
  ATTRIBUTE_ROLE_WIRES,
  type AttributeRole,
  FIELD_TYPE_WIRES,
  type FieldType,
} from "./definitions.js";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const typeId = z.string().regex(ID_PATTERN, "must be an identifier without spaces");

const nonEmptyText = z.string().trim().min(1, "must not be empty");

type FieldTypeWire = (typeof FIELD_TYPE_WIRES)[FieldType];

type AttributeRoleWire = (typeof ATTRIBUTE_ROLE_WIRES)[AttributeRole];

const fieldTypeWire = z.enum(
  Object.values(FIELD_TYPE_WIRES) as [FieldTypeWire, ...FieldTypeWire[]],
);

const attributeRoleWire = z.enum(
  Object.values(ATTRIBUTE_ROLE_WIRES) as [AttributeRoleWire, ...AttributeRoleWire[]],
);

export const typeFileSchema = z.object({
  id: typeId,
  nombre: nonEmptyText,
  descripcion: z.string().optional(),
  atributos: z.array(z.unknown()),
});

export const attributeSchema = z
  .strictObject({
    id: typeId,
    nombre: nonEmptyText,
    tipo: fieldTypeWire,
    rol: attributeRoleWire.optional(),
    obligatorio: z.boolean(),
    opciones: z.array(nonEmptyText).optional(),
    referencia_a: z.array(nonEmptyText).optional(),
  })
  .superRefine((attribute, ctx) => {
    if (
      attribute.opciones !== undefined &&
      attribute.opciones.length > 0 &&
      attribute.tipo !== "seleccion" &&
      attribute.tipo !== "multi-seleccion"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["opciones"],
        message: '"opciones" is only allowed for seleccion or multi-seleccion attributes',
      });
    }
    if (
      attribute.referencia_a !== undefined &&
      attribute.referencia_a.length > 0 &&
      attribute.tipo !== "referencia"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["referencia_a"],
        message: '"referencia_a" is only allowed for referencia attributes',
      });
    }
  });

export const formatIssues = (error: ZodError): string[] =>
  error.issues.map((issue) => {
    const path = issue.path.map((segment) => String(segment)).join(".");
    return path === "" ? issue.message : `${path}: ${issue.message}`;
  });
