import { describe, expect, it } from "vitest";
import {
  attributePayloadSchema,
  attributeRoleWireSchema,
  fieldTypeWireSchema,
  tipoPayloadSchema,
} from "./tipos.js";

const FIELD_TYPES = [
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
];

const ATTRIBUTE_ROLES = ["estado", "vencimiento", "inicio", "fin", "hora"];

describe("fieldTypeWireSchema", () => {
  it("accepts every field type wire", () => {
    for (const wire of FIELD_TYPES) {
      expect(fieldTypeWireSchema.safeParse(wire).success).toBe(true);
    }
  });

  it("rejects internal names", () => {
    expect(fieldTypeWireSchema.safeParse("text").success).toBe(false);
    expect(fieldTypeWireSchema.safeParse("fecha_hora").success).toBe(false);
  });
});

describe("attributeRoleWireSchema", () => {
  it("accepts every role wire", () => {
    for (const wire of ATTRIBUTE_ROLES) {
      expect(attributeRoleWireSchema.safeParse(wire).success).toBe(true);
    }
  });

  it("rejects internal names", () => {
    expect(attributeRoleWireSchema.safeParse("due").success).toBe(false);
  });
});

describe("attributePayloadSchema", () => {
  it("accepts a full attribute", () => {
    const attribute = {
      id: "valoracion",
      nombre: "Valoracion",
      tipo: "seleccion",
      rol: "estado",
      obligatorio: false,
      opciones: ["pendiente", "leido"],
    };

    expect(attributePayloadSchema.parse(attribute)).toEqual(attribute);
  });

  it("accepts a reference attribute", () => {
    const attribute = {
      id: "relacion",
      nombre: "Relacion",
      tipo: "referencia",
      obligatorio: false,
      referencia_a: ["nota"],
    };

    expect(attributePayloadSchema.parse(attribute)).toEqual(attribute);
  });

  it("rejects unknown wires and missing obligatorio", () => {
    expect(
      attributePayloadSchema.safeParse({
        id: "peso",
        nombre: "Peso",
        tipo: "numero-entero",
        obligatorio: false,
      }).success,
    ).toBe(false);
    expect(
      attributePayloadSchema.safeParse({ id: "peso", nombre: "Peso", tipo: "numero" }).success,
    ).toBe(false);
    expect(
      attributePayloadSchema.safeParse({
        id: "peso",
        nombre: "Peso",
        tipo: "numero",
        obligatorio: false,
        rol: "due",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid ids", () => {
    expect(
      attributePayloadSchema.safeParse({
        id: "con espacio",
        nombre: "Peso",
        tipo: "numero",
        obligatorio: false,
      }).success,
    ).toBe(false);
  });
});

describe("tipoPayloadSchema", () => {
  it("accepts a type with attributes", () => {
    const tipo = {
      id: "libro",
      nombre: "Libro",
      descripcion: "Lectura pendiente",
      atributos: [
        { id: "titulo", nombre: "Titulo", tipo: "texto", obligatorio: true },
        {
          id: "valoracion",
          nombre: "Valoracion",
          tipo: "seleccion",
          rol: "estado",
          obligatorio: false,
          opciones: ["pendiente", "leido"],
        },
      ],
    };

    expect(tipoPayloadSchema.parse(tipo)).toEqual(tipo);
  });

  it("accepts a type without descripcion", () => {
    expect(
      tipoPayloadSchema.parse({ id: "nota", nombre: "Nota", atributos: [] }).descripcion,
    ).toBeUndefined();
  });

  it("rejects invalid attributes and payloads", () => {
    expect(tipoPayloadSchema.safeParse({ id: "nota", nombre: "Nota", atributos: {} }).success).toBe(
      false,
    );
    expect(
      tipoPayloadSchema.safeParse({
        id: "nota",
        nombre: "Nota",
        atributos: [{ id: "x", nombre: "X", tipo: "texto" }],
      }).success,
    ).toBe(false);
  });
});
