import { describe, expect, it } from "vitest";
import {
  compararPorHora,
  ESTADOS_RECORDATORIO,
  esEstadoRecordatorio,
  estadoDeRecordatorio,
  horaEnMs,
} from "@/lib/recordatorios";

const ahora = new Date("2026-10-07T12:00:00.000Z");

describe("utilidades de recordatorios", () => {
  it("reconoce los estados del tipo recordatorio", () => {
    expect(ESTADOS_RECORDATORIO).toEqual(["pendiente", "vencido"]);
    expect(esEstadoRecordatorio("pendiente")).toBe(true);
    expect(esEstadoRecordatorio("vencido")).toBe(true);
    expect(esEstadoRecordatorio("hecha")).toBe(false);
    expect(esEstadoRecordatorio(undefined)).toBe(false);
  });

  it("calcula el estado por la hora aunque el atributo diga otra cosa", () => {
    expect(estadoDeRecordatorio("2026-10-07T11:59:00.000Z", ahora)).toBe("vencido");
    expect(estadoDeRecordatorio("2026-10-07T12:00:00.000Z", ahora)).toBe("pendiente");
    expect(estadoDeRecordatorio("2026-10-07T12:01:00.000Z", ahora)).toBe("pendiente");
    expect(estadoDeRecordatorio("", ahora)).toBe("pendiente");
    expect(estadoDeRecordatorio("no-es-fecha", ahora)).toBe("pendiente");
    expect(estadoDeRecordatorio(undefined, ahora)).toBe("pendiente");
  });

  it("convierte horas válidas a milisegundos y descarta el resto", () => {
    expect(horaEnMs("2026-10-07T12:00:00.000Z")).toBe(ahora.getTime());
    expect(horaEnMs("")).toBeUndefined();
    expect(horaEnMs("no-es-fecha")).toBeUndefined();
    expect(horaEnMs(123)).toBeUndefined();
  });

  it("ordena por hora dejando al final las horas ausentes o inválidas", () => {
    const atributos = [
      { hora: "2026-10-08T09:00:00.000Z" },
      { hora: "no-es-fecha" },
      { hora: "2026-10-07T08:00:00.000Z" },
      { hora: "2026-10-09T18:00:00.000Z" },
    ];
    const ordenados = [...atributos].sort(compararPorHora);
    expect(ordenados).toEqual([
      { hora: "2026-10-07T08:00:00.000Z" },
      { hora: "2026-10-08T09:00:00.000Z" },
      { hora: "2026-10-09T18:00:00.000Z" },
      { hora: "no-es-fecha" },
    ]);
  });
});
