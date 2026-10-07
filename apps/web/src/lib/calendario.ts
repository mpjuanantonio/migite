import type { ObjectPayload } from "@migite/contracts";

export const HOLGURA_DIAS = 31;

const relleno = (numero: number): string => String(numero).padStart(2, "0");

export const claveDia = (fecha: Date): string =>
  `${fecha.getFullYear()}-${relleno(fecha.getMonth() + 1)}-${relleno(fecha.getDate())}`;

export const sumarDias = (fecha: Date, dias: number): Date =>
  new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias);

export const inicioDeMes = (fecha: Date): Date =>
  new Date(fecha.getFullYear(), fecha.getMonth(), 1);

export const finDeMes = (fecha: Date): Date =>
  new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0, 23, 59, 59, 999);

export const inicioDelDia = (fecha: Date): Date =>
  new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());

export const finDelDia = (fecha: Date): Date =>
  new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 23, 59, 59, 999);

const inicioDeSemana = (fecha: Date): Date => {
  const desplazamiento = (fecha.getDay() + 6) % 7;
  return sumarDias(fecha, -desplazamiento);
};

export type CeldaMes = {
  readonly fecha: Date;
  readonly clave: string;
  readonly fueraDeMes: boolean;
  readonly esHoy: boolean;
};

export const construirMes = (mes: Date, hoy: Date = new Date()): readonly CeldaMes[] => {
  const primero = inicioDeMes(mes);
  const inicio = inicioDeSemana(primero);
  const desplazamiento = (primero.getDay() + 6) % 7;
  const diasEnMes = finDeMes(mes).getDate();
  const filas = Math.ceil((desplazamiento + diasEnMes) / 7);
  const claveHoy = claveDia(hoy);

  return Array.from({ length: filas * 7 }, (_, indice) => {
    const fecha = sumarDias(inicio, indice);
    return {
      fecha,
      clave: claveDia(fecha),
      fueraDeMes: fecha.getMonth() !== mes.getMonth() || fecha.getFullYear() !== mes.getFullYear(),
      esHoy: claveDia(fecha) === claveHoy,
    };
  });
};

export type EventoCalendario = {
  readonly objeto: ObjectPayload;
  readonly inicio: Date;
  readonly fin: Date;
  readonly todoElDia: boolean;
};

const fechaDe = (valor: unknown): Date | undefined => {
  if (typeof valor !== "string" || valor.trim() === "") {
    return undefined;
  }
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? undefined : fecha;
};

export const interpretarEvento = (objeto: ObjectPayload): EventoCalendario | undefined => {
  const inicio = fechaDe(objeto.atributos.inicio);
  if (inicio === undefined) {
    return undefined;
  }
  const finCrudo = fechaDe(objeto.atributos.fin);
  const fin = finCrudo !== undefined && finCrudo.getTime() >= inicio.getTime() ? finCrudo : inicio;
  return { objeto, inicio, fin, todoElDia: objeto.atributos.todoElDia === true };
};

export const solapa = (evento: EventoCalendario, desde: Date, hasta: Date): boolean =>
  evento.fin.getTime() >= desde.getTime() && evento.inicio.getTime() <= hasta.getTime();

export const eventosDelDia = (
  eventos: readonly EventoCalendario[],
  dia: Date,
): readonly EventoCalendario[] =>
  eventos.filter((evento) => solapa(evento, inicioDelDia(dia), finDelDia(dia)));

export const compararEventos = (a: EventoCalendario, b: EventoCalendario): number => {
  if (a.todoElDia !== b.todoElDia) {
    return a.todoElDia ? -1 : 1;
  }
  const porInicio = a.inicio.getTime() - b.inicio.getTime();
  return porInicio !== 0 ? porInicio : a.objeto.titulo.localeCompare(b.objeto.titulo);
};

const capitalizar = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1);

export const etiquetaMes = (mes: Date, locale: string): string =>
  `${capitalizar(new Intl.DateTimeFormat(locale, { month: "long" }).format(mes))} ${mes.getFullYear()}`;

export const diasDeLaSemana = (locale: string): readonly string[] => {
  const lunes = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, indice) =>
    capitalizar(
      new Intl.DateTimeFormat(locale, { weekday: "short" }).format(sumarDias(lunes, indice)),
    ),
  );
};

export const formatearDia = (fecha: Date, locale: string): string =>
  new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(fecha);

export const formatearHora = (fecha: Date, locale: string): string =>
  new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(fecha);
