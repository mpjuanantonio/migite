import { describe, expect, it, vi } from "vitest";
import { ESTADOS_TAREA, esEstadoTarea, esVencida, fechaLocal, finDelDia } from "@/lib/tareas";

describe("utilidades de tareas", () => {
  it("reconoce los estados del tipo tarea", () => {
    expect(ESTADOS_TAREA).toEqual(["pendiente", "en curso", "hecha"]);
    expect(esEstadoTarea("pendiente")).toBe(true);
    expect(esEstadoTarea("en curso")).toBe(true);
    expect(esEstadoTarea("hecha")).toBe(true);
    expect(esEstadoTarea("archivada")).toBe(false);
    expect(esEstadoTarea(undefined)).toBe(false);
  });

  it("calcula la fecha local y el fin del día", () => {
    const fecha = new Date(2026, 9, 7, 15, 30);
    expect(fechaLocal(fecha)).toBe("2026-10-07");
    expect(finDelDia(fecha)).toBe(new Date(2026, 9, 7, 23, 59, 59, 999).toISOString());
  });

  it("cubre las 23:59 locales aunque la zona sea UTC-5", () => {
    vi.stubEnv("TZ", "America/Bogota");
    try {
      const fecha = new Date(2026, 9, 7, 15, 30);
      expect(new Date(2026, 9, 7).getTimezoneOffset()).toBe(300);
      expect(finDelDia(fecha)).toBe("2026-10-08T04:59:59.999Z");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("marca vencidas solo si la fecha ya pasó y siguen sin hacerse", () => {
    expect(esVencida("2026-10-06", "pendiente", "2026-10-07")).toBe(true);
    expect(esVencida("2026-10-06", "en curso", "2026-10-07")).toBe(true);
    expect(esVencida("2026-10-06", "hecha", "2026-10-07")).toBe(false);
    expect(esVencida("2026-10-07", "pendiente", "2026-10-07")).toBe(false);
    expect(esVencida("", "pendiente", "2026-10-07")).toBe(false);
    expect(esVencida(undefined, "pendiente", "2026-10-07")).toBe(false);
  });
});
