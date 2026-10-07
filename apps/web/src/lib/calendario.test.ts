import type { ObjectPayload } from "@migite/contracts";
import { describe, expect, it } from "vitest";
import {
  claveDia,
  construirSemana,
  distribuirEventos,
  type EventoCalendario,
  etiquetaDia,
  etiquetaSemana,
  inicioDeSemana,
  sumarDias,
} from "./calendario";

const evento = (id: string, inicio: Date, fin?: Date, todoElDia = false): EventoCalendario => {
  const objeto: ObjectPayload = {
    id,
    tipo: "evento",
    titulo: id,
    ruta: `eventos/${id}.md`,
    carpeta: "eventos",
    creado: "2026-10-01T10:00:00.000Z",
    actualizado: "2026-10-05T10:00:00.000Z",
    atributos: {},
    cuerpo: "",
    enlaces: [],
    degraded: [],
  };
  return { objeto, inicio, fin: fin ?? inicio, todoElDia };
};

const dia = new Date(2026, 9, 7);
const enDia = (hora: number, minuto = 0): Date =>
  new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), hora, minuto);

describe("construirSemana", () => {
  it("devuelve de lunes a domingo y marca el día actual", () => {
    const semana = construirSemana(dia, dia);

    expect(semana).toHaveLength(7);
    expect(semana[0]?.fecha.getDay()).toBe(1);
    expect(semana[6]?.fecha.getDay()).toBe(0);
    expect(semana[2]?.clave).toBe(claveDia(dia));
    expect(semana[2]?.esHoy).toBe(true);
    expect(semana[0]?.esHoy).toBe(false);
  });
});

describe("distribuirEventos", () => {
  it("posiciona cada evento de forma proporcional a su inicio y fin", () => {
    const [posicion] = distribuirEventos([evento("A", enDia(10), enDia(11, 30))], dia);

    expect(posicion?.top).toBeCloseTo((600 / 1440) * 100, 4);
    expect(posicion?.alto).toBeCloseTo((90 / 1440) * 100, 4);
    expect(posicion?.columna).toBe(0);
    expect(posicion?.columnas).toBe(1);
  });

  it("da una altura mínima a los eventos sin fin", () => {
    const [posicion] = distribuirEventos([evento("A", enDia(16))], dia);

    expect(posicion?.top).toBeCloseTo((960 / 1440) * 100, 4);
    expect(posicion?.alto).toBeCloseTo((30 / 1440) * 100, 4);
  });

  it("reparte en columnas los eventos solapados y reutiliza huecos libres", () => {
    const posiciones = distribuirEventos(
      [
        evento("A", enDia(10), enDia(12)),
        evento("B", enDia(11), enDia(13)),
        evento("C", enDia(12), enDia(13)),
      ],
      dia,
    );
    const porId = new Map(posiciones.map((posicion) => [posicion.evento.objeto.id, posicion]));

    expect(porId.get("A")?.columna).toBe(0);
    expect(porId.get("B")?.columna).toBe(1);
    expect(porId.get("C")?.columna).toBe(0);
    expect(porId.get("A")?.columnas).toBe(2);
    expect(porId.get("B")?.columnas).toBe(2);
    expect(porId.get("C")?.columnas).toBe(2);
  });

  it("reinicia las columnas cuando los eventos no se solapan", () => {
    const posiciones = distribuirEventos(
      [evento("A", enDia(10), enDia(11)), evento("B", enDia(12), enDia(13))],
      dia,
    );

    expect(posiciones.map((posicion) => posicion.columna)).toEqual([0, 0]);
    expect(posiciones.map((posicion) => posicion.columnas)).toEqual([1, 1]);
  });

  it("recorta los eventos que empiezan el día anterior", () => {
    const [posicion] = distribuirEventos([evento("A", sumarDias(enDia(22), -1), enDia(2))], dia);

    expect(posicion?.top).toBe(0);
    expect(posicion?.alto).toBeCloseTo((120 / 1440) * 100, 4);
  });

  it("excluye los eventos de todo el día", () => {
    expect(distribuirEventos([evento("A", enDia(0), undefined, true)], dia)).toEqual([]);
  });
});

describe("etiquetas de período", () => {
  it("etiqueta la semana por su rango de días", () => {
    const etiqueta = etiquetaSemana(dia, "es");

    expect(etiqueta).toContain(String(inicioDeSemana(dia).getDate()));
    expect(etiqueta).toContain(String(sumarDias(inicioDeSemana(dia), 6).getDate()));
    expect(etiqueta).toContain("2026");
  });

  it("etiqueta el día con la fecha completa capitalizada", () => {
    expect(etiquetaDia(dia, "es")).toMatch(/^[A-ZÁÉÍÓÚ]/);
    expect(etiquetaDia(dia, "es")).toContain("2026");
  });
});
