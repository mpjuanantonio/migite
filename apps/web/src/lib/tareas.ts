export const ESTADOS_TAREA = ["pendiente", "en curso", "hecha"] as const;

export type EstadoTarea = (typeof ESTADOS_TAREA)[number];

export const ESTADO_HECHA: EstadoTarea = "hecha";

export const ESTADOS_PENDIENTES: readonly EstadoTarea[] = ["pendiente", "en curso"];

const relleno = (numero: number): string => String(numero).padStart(2, "0");

export const fechaLocal = (fecha: Date): string =>
  `${fecha.getFullYear()}-${relleno(fecha.getMonth() + 1)}-${relleno(fecha.getDate())}`;

export const finDelDia = (fecha: Date): string => `${fechaLocal(fecha)}T23:59:59.999Z`;

export const esEstadoTarea = (valor: unknown): valor is EstadoTarea =>
  typeof valor === "string" && (ESTADOS_TAREA as readonly string[]).includes(valor);

export const esVencida = (vencimiento: unknown, estado: unknown, hoy: string): boolean =>
  typeof vencimiento === "string" &&
  vencimiento !== "" &&
  estado !== ESTADO_HECHA &&
  vencimiento < hoy;
