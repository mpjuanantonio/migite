import type { AttributePayload } from "@migite/contracts";
import { ESTADOS_PROYECTO } from "./proyectos";
import { ESTADO_PENDIENTE, ESTADO_VENCIDO } from "./recordatorios";
import { ESTADO_HECHA } from "./tareas";

const ESTADOS_TERMINALES: Readonly<Record<string, readonly string[]>> = {
  tarea: [ESTADO_HECHA],
  proyecto: ESTADOS_PROYECTO.filter((estado) => estado === "hecho" || estado === "archivado"),
  recordatorio: [ESTADO_VENCIDO],
};

const ESTADOS_INICIALES: Readonly<Record<string, string>> = {
  tarea: "pendiente",
  proyecto: "activo",
  recordatorio: ESTADO_PENDIENTE,
};

const ATRIBUTOS_OCULTOS: Readonly<Record<string, readonly string[]>> = {
  tarea: ["completada"],
  recordatorio: ["estado"],
};

export const atributosDeAlta = (
  tipoId: string,
  atributos: readonly AttributePayload[],
): AttributePayload[] => {
  const ocultos = ATRIBUTOS_OCULTOS[tipoId] ?? [];
  const terminales = ESTADOS_TERMINALES[tipoId] ?? [];
  return atributos
    .filter((atributo) => !ocultos.includes(atributo.id))
    .map((atributo) =>
      atributo.id === "estado" && terminales.length > 0
        ? {
            ...atributo,
            opciones: (atributo.opciones ?? []).filter((opcion) => !terminales.includes(opcion)),
          }
        : atributo,
    );
};

export const valoresInicialesDeAlta = (tipoId: string): Readonly<Record<string, unknown>> => {
  const estado = ESTADOS_INICIALES[tipoId];
  return estado === undefined ? {} : { estado };
};
