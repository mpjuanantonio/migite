import type { SearchResultItem } from "@migite/contracts";
import { describe, expect, it } from "vitest";
import { agruparResultados, partirFragmento } from "@/lib/busqueda";

const resultado = (id: string, tipo: string, fragmento?: string): SearchResultItem => ({
  id,
  tipo,
  titulo: `Título ${id}`,
  ruta: `${tipo}/${id}.md`,
  actualizado: "2026-10-05T10:00:00.000Z",
  ...(fragmento === undefined ? {} : { fragmento }),
});

describe("agruparResultados", () => {
  it("agrupa por tipo conservando el orden de aparición", () => {
    const grupos = agruparResultados([
      resultado("1", "nota"),
      resultado("2", "tarea"),
      resultado("3", "nota"),
      resultado("4", "libro"),
    ]);

    expect(grupos.map((grupo) => grupo.tipo)).toEqual(["nota", "tarea", "libro"]);
    expect(grupos[0]?.resultados.map((item) => item.id)).toEqual(["1", "3"]);
    expect(grupos[1]?.resultados.map((item) => item.id)).toEqual(["2"]);
  });

  it("devuelve una lista vacía sin resultados", () => {
    expect(agruparResultados([])).toEqual([]);
  });
});

describe("partirFragmento", () => {
  it("marca las coincidencias sin distinguir mayúsculas", () => {
    const partes = partirFragmento("Una Casa con casa y más cosas", "casa");

    expect(partes.filter((parte) => parte.coincide).map((parte) => parte.texto)).toEqual([
      "Casa",
      "casa",
    ]);
    expect(partes.map((parte) => parte.texto).join("")).toBe("Una Casa con casa y más cosas");
  });

  it("marca cualquiera de los términos de la búsqueda", () => {
    const partes = partirFragmento("casa y huerto", "casa huerto");

    expect(partes.filter((parte) => parte.coincide).map((parte) => parte.texto)).toEqual([
      "casa",
      "huerto",
    ]);
  });

  it("no marca nada si no hay términos", () => {
    expect(partirFragmento("texto", "  ")).toEqual([{ texto: "texto", coincide: false }]);
  });

  it("trata los caracteres especiales como texto literal", () => {
    const partes = partirFragmento("precio (casa)", "(casa)");

    expect(partes.filter((parte) => parte.coincide).map((parte) => parte.texto)).toEqual([
      "(casa)",
    ]);
  });
});
