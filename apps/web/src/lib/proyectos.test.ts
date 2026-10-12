import { describe, expect, it } from "vitest";
import { ESTADOS_PROYECTO, esEstadoProyecto, lineaResumen } from "@/lib/proyectos";

describe("estados de proyecto", () => {
  it("reconoce los estados definidos por el tipo nativo", () => {
    for (const estado of ESTADOS_PROYECTO) {
      expect(esEstadoProyecto(estado)).toBe(true);
    }
    expect(esEstadoProyecto("empezado")).toBe(false);
    expect(esEstadoProyecto(undefined)).toBe(false);
    expect(esEstadoProyecto(3)).toBe(false);
  });
});

describe("lineaResumen", () => {
  it("devuelve la primera línea con contenido", () => {
    expect(lineaResumen("\n  Primer paso\nSegunda línea\n")).toBe("Primer paso");
  });

  it("devuelve cadena vacía si el cuerpo no tiene contenido", () => {
    expect(lineaResumen("")).toBe("");
    expect(lineaResumen("  \n\t\n")).toBe("");
  });
});
