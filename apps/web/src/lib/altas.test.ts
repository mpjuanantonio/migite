import type { AttributePayload } from "@migite/contracts";
import { describe, expect, it } from "vitest";
import { atributosDeAlta, valoresInicialesDeAlta } from "./altas";

const atributo = (overrides: Partial<AttributePayload>): AttributePayload => ({
  id: "campo",
  nombre: "Campo",
  tipo: "texto",
  obligatorio: false,
  ...overrides,
});

const estadoTarea = atributo({
  id: "estado",
  nombre: "Estado",
  tipo: "seleccion",
  rol: "estado",
  obligatorio: true,
  opciones: ["pendiente", "en curso", "hecha"],
});
const vencimiento = atributo({ id: "vencimiento", nombre: "Vencimiento", tipo: "fecha" });
const completada = atributo({ id: "completada", nombre: "Completada", tipo: "fecha-hora" });

const estadoProyecto = atributo({
  id: "estado",
  nombre: "Estado",
  tipo: "seleccion",
  rol: "estado",
  obligatorio: true,
  opciones: ["activo", "pausado", "hecho", "archivado"],
});

const hora = atributo({
  id: "hora",
  nombre: "Hora",
  tipo: "fecha-hora",
  rol: "hora",
  obligatorio: true,
});
const estadoRecordatorio = atributo({
  id: "estado",
  nombre: "Estado",
  tipo: "seleccion",
  obligatorio: true,
  opciones: ["pendiente", "vencido"],
});

describe("atributosDeAlta", () => {
  it("oculta el estado terminal de tarea y el campo completada", () => {
    const resultado = atributosDeAlta("tarea", [estadoTarea, vencimiento, completada]);
    expect(resultado.map((item) => item.id)).toEqual(["estado", "vencimiento"]);
    expect(resultado[0]?.opciones).toEqual(["pendiente", "en curso"]);
  });

  it("oculta los estados terminales de proyecto", () => {
    const resultado = atributosDeAlta("proyecto", [estadoProyecto]);
    expect(resultado[0]?.opciones).toEqual(["activo", "pausado"]);
  });

  it("no ofrece el estado derivado de recordatorio", () => {
    const resultado = atributosDeAlta("recordatorio", [hora, estadoRecordatorio]);
    expect(resultado.map((item) => item.id)).toEqual(["hora"]);
  });

  it("deja intactos los tipos personalizados", () => {
    const genero = atributo({
      id: "estado",
      nombre: "Estado",
      tipo: "seleccion",
      opciones: ["borrador", "publicado"],
    });
    const atributos = [estadoProyecto, genero];
    expect(atributosDeAlta("libro", atributos)).toEqual(atributos);
  });
});

describe("valoresInicialesDeAlta", () => {
  it("fija el estado inicial de los tipos nativos con estado", () => {
    expect(valoresInicialesDeAlta("tarea")).toEqual({ estado: "pendiente" });
    expect(valoresInicialesDeAlta("proyecto")).toEqual({ estado: "activo" });
    expect(valoresInicialesDeAlta("recordatorio")).toEqual({ estado: "pendiente" });
  });

  it("no inventa valores para el resto de tipos", () => {
    expect(valoresInicialesDeAlta("nota")).toEqual({});
    expect(valoresInicialesDeAlta("evento")).toEqual({});
    expect(valoresInicialesDeAlta("libro")).toEqual({});
  });
});
