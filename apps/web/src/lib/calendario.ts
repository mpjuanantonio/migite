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

export const inicioDeSemana = (fecha: Date): Date => {
  const desplazamiento = (fecha.getDay() + 6) % 7;
  return sumarDias(fecha, -desplazamiento);
};

export const finDeSemana = (fecha: Date): Date => {
  const inicio = inicioDeSemana(fecha);
  return new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 6, 23, 59, 59, 999);
};

export type CeldaDia = {
  readonly fecha: Date;
  readonly clave: string;
  readonly esHoy: boolean;
};

const celdaDia = (fecha: Date, claveHoy: string): CeldaDia => ({
  fecha,
  clave: claveDia(fecha),
  esHoy: claveDia(fecha) === claveHoy,
});

export const construirDia = (fecha: Date, hoy: Date = new Date()): CeldaDia =>
  celdaDia(inicioDelDia(fecha), claveDia(hoy));

export const construirSemana = (fecha: Date, hoy: Date = new Date()): readonly CeldaDia[] => {
  const inicio = inicioDeSemana(fecha);
  const claveHoy = claveDia(hoy);
  return Array.from({ length: 7 }, (_, indice) => celdaDia(sumarDias(inicio, indice), claveHoy));
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

export const HORAS_DEL_DIA: readonly number[] = Array.from({ length: 24 }, (_, hora) => hora);

export const claveHora = (hora: number): string => `${relleno(hora)}:00`;

export const MINUTOS_DIA = 24 * 60;

export const MINUTOS_MINIMOS_EVENTO = 30;

export type EventoPosicionado = {
  readonly evento: EventoCalendario;
  readonly top: number;
  readonly alto: number;
  readonly columna: number;
  readonly columnas: number;
};

type Tramo = {
  readonly evento: EventoCalendario;
  readonly inicio: number;
  readonly fin: number;
  columna: number;
};

export const distribuirEventos = (
  eventos: readonly EventoCalendario[],
  dia: Date,
): readonly EventoPosicionado[] => {
  const inicioDia = inicioDelDia(dia).getTime();
  const finDia = sumarDias(inicioDelDia(dia), 1).getTime();
  const minimo = MINUTOS_MINIMOS_EVENTO * 60_000;

  const tramos = eventosDelDia(eventos, dia)
    .filter((evento) => !evento.todoElDia)
    .sort(compararEventos)
    .map((evento): Tramo => {
      const inicio = Math.max(evento.inicio.getTime(), inicioDia);
      const fin = Math.min(Math.max(evento.fin.getTime(), inicio + minimo), finDia);
      return {
        evento,
        inicio: (inicio - inicioDia) / 60_000,
        fin: (fin - inicioDia) / 60_000,
        columna: 0,
      };
    });

  const posicionados: EventoPosicionado[] = [];
  let grupo: Tramo[] = [];
  let finGrupo = Number.NEGATIVE_INFINITY;
  let columnasFin: number[] = [];

  const cerrarGrupo = (): void => {
    const columnas = grupo.reduce((maximo, tramo) => Math.max(maximo, tramo.columna + 1), 0);
    for (const tramo of grupo) {
      posicionados.push({
        evento: tramo.evento,
        top: (tramo.inicio / MINUTOS_DIA) * 100,
        alto: ((tramo.fin - tramo.inicio) / MINUTOS_DIA) * 100,
        columna: tramo.columna,
        columnas,
      });
    }
    grupo = [];
    finGrupo = Number.NEGATIVE_INFINITY;
  };

  for (const tramo of tramos) {
    if (tramo.inicio >= finGrupo) {
      cerrarGrupo();
      columnasFin = [];
    }
    const libre = columnasFin.findIndex((fin) => fin <= tramo.inicio);
    if (libre === -1) {
      tramo.columna = columnasFin.length;
      columnasFin.push(tramo.fin);
    } else {
      tramo.columna = libre;
      columnasFin[libre] = tramo.fin;
    }
    grupo.push(tramo);
    finGrupo = Math.max(finGrupo, tramo.fin);
  }
  cerrarGrupo();

  return posicionados;
};

const capitalizar = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1);

export const etiquetaMes = (mes: Date, locale: string): string =>
  `${capitalizar(new Intl.DateTimeFormat(locale, { month: "long" }).format(mes))} ${mes.getFullYear()}`;

export const nombreDiaCorto = (fecha: Date, locale: string): string =>
  capitalizar(new Intl.DateTimeFormat(locale, { weekday: "short" }).format(fecha));

export const diasDeLaSemana = (locale: string): readonly string[] => {
  const lunes = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, indice) => nombreDiaCorto(sumarDias(lunes, indice), locale));
};

export const etiquetaSemana = (fecha: Date, locale: string): string => {
  const inicio = inicioDeSemana(fecha);
  const fin = sumarDias(inicio, 6);
  const formato = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return capitalizar(`${formato.format(inicio)} – ${formato.format(fin)}`);
};

export const formatearDia = (fecha: Date, locale: string): string =>
  new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(fecha);

export const etiquetaDia = (fecha: Date, locale: string): string =>
  capitalizar(formatearDia(fecha, locale));

export const formatearHora = (fecha: Date, locale: string): string =>
  new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(fecha);
