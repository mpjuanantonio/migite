import type { Accion } from "@migite/contracts";
import { describe, expect, it } from "vitest";
import { translate } from "@/i18n/translate";
import { resumirAccion } from "./chat";

const base = {
  id: "A1",
  estado: "pendiente",
  creada: "2026-10-18T10:00:00.000Z",
} as const;

describe("resumirAccion", () => {
  it("resume guardar_memoria con la clave del payload", () => {
    const propuesta: Accion = {
      ...base,
      tipoAccion: "guardar_memoria",
      payload: { clave: "color favorito", contenido: "verde oscuro" },
    };

    expect(resumirAccion(propuesta, translate)).toBe("Recordar «color favorito»");
  });

  it("resume crear_tipo con el nombre del payload", () => {
    const propuesta: Accion = {
      ...base,
      tipoAccion: "crear_tipo",
      payload: { nombre: "nota rápida", atributos: [] },
    };

    expect(resumirAccion(propuesta, translate)).toBe("Crear tipo «nota rápida»");
  });

  it("cae al identificador cuando el payload no cumple el contrato", () => {
    const rota: Accion = {
      ...base,
      tipoAccion: "guardar_memoria",
      payload: {},
    };

    expect(resumirAccion(rota, translate)).toBe("Acción «guardar_memoria»");
  });
});
