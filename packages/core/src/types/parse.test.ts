import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/index.js";
import {
  ATTRIBUTE_ROLE_WIRES,
  FIELD_TYPE_WIRES,
  isReservedTypeId,
  parseTypeYaml,
  WIRE_TO_ATTRIBUTE_ROLE,
  WIRE_TO_FIELD_TYPE,
} from "./index.js";

const yamlGate = vi.hoisted(() => ({ throwOnParse: false }));

vi.mock("yaml", async (importOriginal) => {
  const actual = await importOriginal<typeof import("yaml")>();
  return {
    ...actual,
    parse: (text: string) => {
      if (yamlGate.throwOnParse) {
        throw new Error("injected YAML parser failure");
      }
      return actual.parse(text);
    },
  };
});

afterEach(() => {
  yamlGate.throwOnParse = false;
});

const VALID_LIBRO = `id: libro
nombre: Libro
descripcion: Lectura pendiente
atributos:
  - id: titulo
    nombre: Titulo
    tipo: texto
    obligatorio: true
  - id: valoracion
    nombre: Valoracion
    tipo: seleccion
    rol: estado
    obligatorio: false
    opciones:
      - pendiente
      - leido
  - id: relacion
    nombre: Relacion
    tipo: referencia
    obligatorio: false
    referencia_a:
      - nota
`;

const VALID_RECORDATORIO = `id: recordatorio
nombre: Recordatorio
descripcion: Aviso a una hora concreta
atributos:
  - id: hora
    nombre: Hora
    tipo: fecha-hora
    rol: hora
    obligatorio: true
    opciones: []
    referencia_a: []
`;

const parseOk = (text: string) => {
  const result = parseTypeYaml(text);
  if (!result.ok) {
    throw new Error(`expected ok, got problems: ${result.problems.join(" | ")}`);
  }
  return result.value;
};

const parseProblems = (text: string): string[] => {
  const result = parseTypeYaml(text);
  if (result.ok) {
    throw new Error("expected problems, got a valid type");
  }
  return result.problems;
};

describe("parseTypeYaml", () => {
  describe("valid files", () => {
    it("parses a complete type file into the internal model", () => {
      const value = parseOk(VALID_LIBRO);

      expect(value).toEqual({
        id: "libro",
        name: "Libro",
        description: "Lectura pendiente",
        system: false,
        attributes: [
          { id: "titulo", name: "Titulo", type: "text", required: true },
          {
            id: "valoracion",
            name: "Valoracion",
            type: "select",
            role: "status",
            required: false,
            options: ["pendiente", "leido"],
          },
          {
            id: "relacion",
            name: "Relacion",
            type: "reference",
            required: false,
            references: ["nota"],
          },
        ],
      });
    });

    it("parses the documented recordatorio format with empty options arrays", () => {
      const value = parseOk(VALID_RECORDATORIO);

      expect(value.attributes).toEqual([
        { id: "hora", name: "Hora", type: "datetime", role: "time", required: true },
      ]);
      expect(value.attributes[0]).not.toHaveProperty("options");
      expect(value.attributes[0]).not.toHaveProperty("references");
      expect(value.system).toBe(true);
    });

    it("accepts a type without attributes and without descripcion", () => {
      const value = parseOk("id: libro\nnombre: Libro\natributos: []\n");

      expect(value.attributes).toEqual([]);
      expect(value).not.toHaveProperty("description");
    });

    it("ignores unknown keys of the type file", () => {
      const value = parseOk("id: libro\nnombre: Libro\natributos: []\nprioridad: alta\n");

      expect(value).not.toHaveProperty("prioridad");
      expect(value.id).toBe("libro");
    });

    it("keeps the first definition of a duplicated attribute id", () => {
      const value = parseOk(`id: libro
nombre: Libro
atributos:
  - id: titulo
    nombre: Primero
    tipo: texto
    obligatorio: true
  - id: titulo
    nombre: Segundo
    tipo: numero
    obligatorio: false
`);

      expect(value.attributes).toHaveLength(1);
      expect(value.attributes[0]?.name).toBe("Primero");
    });
  });

  describe("unusable files", () => {
    it("degrades to a controlled problem when the parser throws unexpectedly", () => {
      yamlGate.throwOnParse = true;

      expect(parseProblems("id: libro\nnombre: Libro\natributos: []\n")).toEqual([
        t("error.invalidYamlSyntax"),
      ]);
    });

    it("reports unreadable YAML without dumping the content", () => {
      const problems = parseProblems("id: libro\n\t nombre: Libro\nSECRETO: sk-filtrado\n");

      expect(problems.join(" ")).toContain(t("error.invalidYamlSyntax"));
      expect(problems.join(" ")).not.toContain("sk-filtrado");
    });

    it("reports a document that is not a mapping", () => {
      expect(parseProblems("- nota\n- tarea\n")[0]).toContain("mapping");
    });

    it("reports every missing required field", () => {
      const problems = parseProblems("atributos: []\n");

      expect(problems).toContain('missing required field "id"');
      expect(problems).toContain('missing required field "nombre"');
    });

    it("reports a single missing required field", () => {
      expect(parseProblems("id: libro\natributos: []\n")).toEqual([
        'missing required field "nombre"',
      ]);
    });

    it("reports atributos when it is not a list", () => {
      const problems = parseProblems("id: libro\nnombre: Libro\natributos: hora\n");

      expect(problems.join(" ")).toContain("atributos");
    });

    it("reports an id that is not an identifier", () => {
      const problems = parseProblems("id: tipo malo\nnombre: Tipo\natributos: []\n");

      expect(problems.join(" ")).toContain("id");
    });

    it("reports a descripcion that is not a text", () => {
      const problems = parseProblems("id: libro\nnombre: Libro\ndescripcion: 42\natributos: []\n");

      expect(problems.join(" ")).toContain("descripcion");
    });
  });

  describe("tolerant attribute handling", () => {
    it("keeps the type when an attribute has an unknown field type", () => {
      const value = parseOk(`id: libro
nombre: Libro
atributos:
  - id: hora
    nombre: Hora
    tipo: fecha-hora-2
    obligatorio: true
  - id: titulo
    nombre: Titulo
    tipo: texto
    obligatorio: true
`);

      expect(value.attributes).toHaveLength(1);
      expect(value.attributes[0]?.id).toBe("titulo");
    });

    it("drops attributes with an unusable structure", () => {
      const value = parseOk(`id: libro
nombre: Libro
atributos:
  - id: sin-obligatorio
    nombre: Sin obligatorio
    tipo: texto
  - id: rol-malo
    nombre: Rol malo
    tipo: texto
    rol: loco
    obligatorio: true
  - id: opciones-mal
    nombre: Opciones mal
    tipo: texto
    obligatorio: true
    opciones:
      - una
  - id: referencia-mal
    nombre: Referencia mal
    tipo: texto
    obligatorio: true
    referencia_a:
      - nota
  - id: sin-nombre
    tipo: texto
    obligatorio: true
`);

      expect(value.attributes).toEqual([]);
    });

    it("drops attributes with keys outside the documented format", () => {
      const value = parseOk(`id: libro
nombre: Libro
atributos:
  - id: titulo
    nombre: Titulo
    tipo: texto
    obligatorio: false
    color: rojo
`);

      expect(value.attributes).toEqual([]);
    });
  });

  describe("reserved ids", () => {
    it("marks every reserved id as a system type", () => {
      for (const id of ["nota", "tarea", "recordatorio", "evento", "proyecto"]) {
        const value = parseOk(`id: ${id}\nnombre: Tipo\natributos: []\n`);
        expect(value.system).toBe(true);
      }
    });

    it("exposes the reserved ids through isReservedTypeId", () => {
      expect(isReservedTypeId("nota")).toBe(true);
      expect(isReservedTypeId("recordatorio")).toBe(true);
      expect(isReservedTypeId("libro")).toBe(false);
      expect(isReservedTypeId("Nota")).toBe(false);
      expect(isReservedTypeId("")).toBe(false);
    });
  });

  describe("wire maps", () => {
    it("maps every field type to its wire value", () => {
      expect(FIELD_TYPE_WIRES).toEqual({
        text: "texto",
        number: "numero",
        date: "fecha",
        datetime: "fecha-hora",
        boolean: "booleano",
        select: "seleccion",
        multiSelect: "multi-seleccion",
        url: "url",
        reference: "referencia",
        file: "archivo",
      });
      expect(Object.keys(FIELD_TYPE_WIRES)).toHaveLength(10);
      expect(Object.keys(FIELD_TYPE_WIRES).sort()).toEqual(
        Object.values(WIRE_TO_FIELD_TYPE).sort(),
      );
      expect(Object.values(FIELD_TYPE_WIRES).sort()).toEqual(
        Object.keys(WIRE_TO_FIELD_TYPE).sort(),
      );
    });

    it("maps every attribute role to its wire value", () => {
      expect(ATTRIBUTE_ROLE_WIRES).toEqual({
        status: "estado",
        due: "vencimiento",
        start: "inicio",
        end: "fin",
        time: "hora",
      });
      expect(Object.keys(ATTRIBUTE_ROLE_WIRES)).toHaveLength(5);
      expect(Object.keys(ATTRIBUTE_ROLE_WIRES).sort()).toEqual(
        Object.values(WIRE_TO_ATTRIBUTE_ROLE).sort(),
      );
      expect(Object.values(ATTRIBUTE_ROLE_WIRES).sort()).toEqual(
        Object.keys(WIRE_TO_ATTRIBUTE_ROLE).sort(),
      );
    });
  });
});
