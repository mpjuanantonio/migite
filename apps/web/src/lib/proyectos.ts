export const ESTADOS_PROYECTO = ["activo", "pausado", "hecho", "archivado"] as const;

export type EstadoProyecto = (typeof ESTADOS_PROYECTO)[number];

export const ESTADO_ACTIVO: EstadoProyecto = "activo";

export const esEstadoProyecto = (valor: unknown): valor is EstadoProyecto =>
  typeof valor === "string" && (ESTADOS_PROYECTO as readonly string[]).includes(valor);

export const lineaResumen = (cuerpo: string): string => {
  const linea = cuerpo.split("\n").find((item) => item.trim() !== "");
  return linea?.trim() ?? "";
};
