export const ESTADOS_RECORDATORIO = ["pendiente", "vencido"] as const;

export type EstadoRecordatorio = (typeof ESTADOS_RECORDATORIO)[number];

export const ESTADO_PENDIENTE: EstadoRecordatorio = "pendiente";

export const ESTADO_VENCIDO: EstadoRecordatorio = "vencido";

export const esEstadoRecordatorio = (valor: unknown): valor is EstadoRecordatorio =>
  typeof valor === "string" && (ESTADOS_RECORDATORIO as readonly string[]).includes(valor);

export const horaEnMs = (valor: unknown): number | undefined => {
  if (typeof valor !== "string" || valor === "") {
    return undefined;
  }
  const ms = new Date(valor).getTime();
  return Number.isNaN(ms) ? undefined : ms;
};

export const estadoDeRecordatorio = (hora: unknown, ahora: Date): EstadoRecordatorio => {
  const ms = horaEnMs(hora);
  return ms !== undefined && ms < ahora.getTime() ? ESTADO_VENCIDO : ESTADO_PENDIENTE;
};

export const compararPorHora = (
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
): number => {
  const msA = horaEnMs(a.hora) ?? Number.POSITIVE_INFINITY;
  const msB = horaEnMs(b.hora) ?? Number.POSITIVE_INFINITY;
  return msA - msB;
};
