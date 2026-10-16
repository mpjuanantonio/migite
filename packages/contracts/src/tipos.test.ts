import { describe, expect, it } from "vitest";
import {
  attributePayloadSchema,
  attributeRoleWireSchema,
  fieldTypeWireSchema,
  presentacionPayloadSchema,
  presentacionSeccionSchema,
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

describe("cotas de attributePayloadSchema", () => {
  const atributo = (extra: Record<string, unknown>) => ({
    id: "etiquetas",
    nombre: "Etiquetas",
    tipo: "seleccion",
    obligatorio: false,
    ...extra,
  });

  it("acepta hasta 100 opciones y rechaza 101", () => {
    const cien = Array.from({ length: 100 }, (_, index) => `opcion-${index}`);

    expect(attributePayloadSchema.safeParse(atributo({ opciones: cien })).success).toBe(true);
    expect(
      attributePayloadSchema.safeParse(atributo({ opciones: [...cien, "extra"] })).success,
    ).toBe(false);
  });

  it("acepta hasta 32 referencias y rechaza 33", () => {
    const treintaYDos = Array.from({ length: 32 }, (_, index) => `tipo-${index}`);

    expect(
      attributePayloadSchema.safeParse(atributo({ tipo: "referencia", referencia_a: treintaYDos }))
        .success,
    ).toBe(true);
    expect(
      attributePayloadSchema.safeParse(
        atributo({ tipo: "referencia", referencia_a: [...treintaYDos, "extra"] }),
      ).success,
    ).toBe(false);
  });
});

describe("cotas de presentacionPayloadSchema", () => {
  it("acepta una carpeta de 200 caracteres y rechaza 201", () => {
    expect(presentacionPayloadSchema.safeParse({ carpeta: "a".repeat(200) }).success).toBe(true);
    expect(presentacionPayloadSchema.safeParse({ carpeta: "a".repeat(201) }).success).toBe(false);
  });
});

describe("presentacionSeccionSchema", () => {
  it("accepts the documented sections", () => {
    expect(presentacionSeccionSchema.parse("notas")).toBe("notas");
    expect(presentacionSeccionSchema.parse("productividad")).toBe("productividad");
  });

  it("rejects unknown sections", () => {
    expect(presentacionSeccionSchema.safeParse("biblioteca").success).toBe(false);
  });
});

describe("presentacionPayloadSchema", () => {
  it("accepts a full block", () => {
    const presentacion = { seccion: "notas", carpeta: "Libros", visible: false };

    expect(presentacionPayloadSchema.parse(presentacion)).toEqual(presentacion);
  });

  it("accepts a partial block", () => {
    expect(presentacionPayloadSchema.parse({ visible: true })).toEqual({ visible: true });
  });

  it("rejects invalid sections, empty folders and non-boolean visibility", () => {
    expect(presentacionPayloadSchema.safeParse({ seccion: "biblioteca" }).success).toBe(false);
    expect(presentacionPayloadSchema.safeParse({ carpeta: "   " }).success).toBe(false);
    expect(presentacionPayloadSchema.safeParse({ visible: "si" }).success).toBe(false);
    expect(presentacionPayloadSchema.safeParse({ extra: 1 }).success).toBe(false);
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

  it("accepts a type with a presentacion block", () => {
    const tipo = {
      id: "libro",
      nombre: "Libro",
      atributos: [],
      presentacion: { seccion: "notas", carpeta: "Libros", visible: true },
    };

    expect(tipoPayloadSchema.parse(tipo)).toEqual(tipo);
  });

  it("rejects an invalid presentacion block", () => {
    expect(
      tipoPayloadSchema.safeParse({
        id: "libro",
        nombre: "Libro",
        atributos: [],
        presentacion: { seccion: "biblioteca" },
      }).success,
    ).toBe(false);
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
