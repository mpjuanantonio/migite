import { parseWikilink } from "@/lib/wikilinks";

export const CLASE_NEGRITA = "cm-lp-negrita";
export const CLASE_CURSIVA = "cm-lp-cursiva";
export const CLASE_TACHADO = "cm-lp-tachado";
export const CLASE_CODIGO_INLINE = "cm-lp-codigo-inline";
export const CLASE_CITA = "cm-lp-cita";
export const CLASE_LISTA = "cm-lp-lista";
export const CLASE_TAREA = "cm-lp-tarea";
export const CLASE_TAREA_HECHA = "cm-lp-tarea-hecha";
export const CLASE_REGLA = "cm-lp-regla";
export const CLASE_CODIGO = "cm-lp-codigo";
export const CLASE_CODIGO_BORDE = "cm-lp-codigo-borde";

export const claseEncabezado = (nivel: number): string => `cm-lp-h${nivel}`;

export type WidgetLivePreview =
  | { readonly tipo: "wikilink"; readonly titulo: string; readonly etiqueta: string }
  | { readonly tipo: "checkbox"; readonly marcado: boolean; readonly etiqueta: string }
  | { readonly tipo: "enlace"; readonly texto: string; readonly url: string }
  | { readonly tipo: "marcador"; readonly texto: string };

export type DecoracionLivePreview =
  | { readonly tipo: "ocultar"; readonly desde: number; readonly hasta: number }
  | {
      readonly tipo: "marca";
      readonly desde: number;
      readonly hasta: number;
      readonly clase: string;
    }
  | { readonly tipo: "linea"; readonly desde: number; readonly clase: string }
  | {
      readonly tipo: "widget";
      readonly desde: number;
      readonly hasta: number;
      readonly widget: WidgetLivePreview;
    };

type Linea = {
  readonly inicio: number;
  readonly fin: number;
  readonly texto: string;
};

const BLOQUE_CODIGO = /^\s*(?:`{3,}|~{3,})/;
const ENCABEZADO = /^(#{1,6})\s+/;
const CITA = /^(?:>\s?)+/;
const TAREA = /^(\s*)([-*+])\s+\[([ xX])\]\s*/;
const VINETA = /^(\s*)([-*+])\s+/;
const NUMERADA = /^\s*\d+[.)]\s+/;
const REGLA = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const ENLACE = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\)/;

const lineasDe = (texto: string): readonly Linea[] => {
  const lineas: Linea[] = [];
  let inicio = 0;
  for (const textoLinea of texto.split("\n")) {
    lineas.push({ inicio, fin: inicio + textoLinea.length, texto: textoLinea });
    inicio += textoLinea.length + 1;
  }
  return lineas;
};

const indiceDeLinea = (lineas: readonly Linea[], posicion: number): number => {
  if (posicion < 0) {
    return -1;
  }
  for (let indice = 0; indice < lineas.length; indice += 1) {
    const linea = lineas[indice];
    if (linea !== undefined && posicion <= linea.fin) {
      return indice;
    }
  }
  return lineas.length - 1;
};

const bloquesDeCodigo = (lineas: readonly Linea[]): readonly (number | undefined)[] => {
  const bloques: (number | undefined)[] = [];
  let abierto: number | undefined;
  let siguiente = 0;
  for (const linea of lineas) {
    const esBorde = BLOQUE_CODIGO.test(linea.texto);
    if (abierto === undefined) {
      if (esBorde) {
        abierto = siguiente;
        siguiente += 1;
        bloques.push(abierto);
        continue;
      }
      bloques.push(undefined);
      continue;
    }
    bloques.push(abierto);
    if (esBorde) {
      abierto = undefined;
    }
  }
  return bloques;
};

const decoracionesInline = (
  texto: string,
  desplazamiento: number,
  cursor: number,
): readonly DecoracionLivePreview[] => {
  const resultado: DecoracionLivePreview[] = [];
  const enCursor = (desde: number, hasta: number): boolean => cursor >= desde && cursor < hasta;
  let indice = 0;

  while (indice < texto.length) {
    const actual = texto[indice];

    if (actual === "`") {
      const cierre = texto.indexOf("`", indice + 1);
      if (cierre > indice + 1) {
        const desde = desplazamiento + indice;
        const hasta = desplazamiento + cierre + 1;
        if (!enCursor(desde, hasta)) {
          resultado.push(
            { tipo: "ocultar", desde, hasta: desde + 1 },
            {
              tipo: "marca",
              desde: desde + 1,
              hasta: desplazamiento + cierre,
              clase: CLASE_CODIGO_INLINE,
            },
            { tipo: "ocultar", desde: desplazamiento + cierre, hasta },
          );
        }
        indice = cierre + 1;
        continue;
      }
      indice += 1;
      continue;
    }

    if (actual === "[" && texto[indice + 1] === "[") {
      const cierre = texto.indexOf("]]", indice + 2);
      const interno = cierre === -1 ? "" : texto.slice(indice + 2, cierre).trim();
      if (cierre > indice + 2 && interno !== "") {
        const desde = desplazamiento + indice;
        const hasta = desplazamiento + cierre + 2;
        if (!enCursor(desde, hasta)) {
          const { titulo, etiqueta } = parseWikilink(interno);
          resultado.push({
            tipo: "widget",
            desde,
            hasta,
            widget: { tipo: "wikilink", titulo, etiqueta },
          });
        }
        indice = cierre + 2;
        continue;
      }
    }

    if (actual === "[") {
      const enlace = ENLACE.exec(texto.slice(indice));
      if (enlace !== null) {
        const desde = desplazamiento + indice;
        const hasta = desde + enlace[0].length;
        if (!enCursor(desde, hasta)) {
          resultado.push({
            tipo: "widget",
            desde,
            hasta,
            widget: { tipo: "enlace", texto: enlace[1] ?? "", url: enlace[2] ?? "" },
          });
        }
        indice += enlace[0].length;
        continue;
      }
    }

    if (actual === "*" && texto[indice + 1] === "*") {
      const cierre = texto.indexOf("**", indice + 2);
      if (cierre > indice + 2) {
        const desde = desplazamiento + indice;
        const hasta = desplazamiento + cierre + 2;
        if (!enCursor(desde, hasta)) {
          resultado.push(
            { tipo: "ocultar", desde, hasta: desde + 2 },
            {
              tipo: "marca",
              desde: desde + 2,
              hasta: desplazamiento + cierre,
              clase: CLASE_NEGRITA,
            },
            { tipo: "ocultar", desde: desplazamiento + cierre, hasta },
          );
        }
        indice = cierre + 2;
        continue;
      }
    }

    if (actual === "~" && texto[indice + 1] === "~") {
      const cierre = texto.indexOf("~~", indice + 2);
      if (cierre > indice + 2) {
        const desde = desplazamiento + indice;
        const hasta = desplazamiento + cierre + 2;
        if (!enCursor(desde, hasta)) {
          resultado.push(
            { tipo: "ocultar", desde, hasta: desde + 2 },
            {
              tipo: "marca",
              desde: desde + 2,
              hasta: desplazamiento + cierre,
              clase: CLASE_TACHADO,
            },
            { tipo: "ocultar", desde: desplazamiento + cierre, hasta },
          );
        }
        indice = cierre + 2;
        continue;
      }
    }

    if (actual === "*") {
      const siguiente = texto[indice + 1];
      if (siguiente !== undefined && siguiente !== " " && siguiente !== "*") {
        const cierre = texto.indexOf("*", indice + 1);
        if (cierre > indice + 1 && texto[cierre - 1] !== " ") {
          const desde = desplazamiento + indice;
          const hasta = desplazamiento + cierre + 1;
          if (!enCursor(desde, hasta)) {
            resultado.push(
              { tipo: "ocultar", desde, hasta: desde + 1 },
              {
                tipo: "marca",
                desde: desde + 1,
                hasta: desplazamiento + cierre,
                clase: CLASE_CURSIVA,
              },
              { tipo: "ocultar", desde: desplazamiento + cierre, hasta },
            );
          }
          indice = cierre + 1;
          continue;
        }
      }
    }

    indice += 1;
  }

  return resultado;
};

const decoracionesBloque = (
  linea: Linea,
  esLineaCursor: boolean,
): readonly DecoracionLivePreview[] => {
  const resultado: DecoracionLivePreview[] = [];
  const texto = linea.texto;

  const tarea = TAREA.exec(texto);
  if (tarea !== null) {
    const marcado = (tarea[3] ?? "").toLowerCase() === "x";
    resultado.push({ tipo: "linea", desde: linea.inicio, clase: CLASE_TAREA });
    if (marcado) {
      resultado.push({ tipo: "linea", desde: linea.inicio, clase: CLASE_TAREA_HECHA });
    }
    if (!esLineaCursor) {
      resultado.push({
        tipo: "widget",
        desde: linea.inicio,
        hasta: linea.inicio + tarea[0].length,
        widget: {
          tipo: "checkbox",
          marcado,
          etiqueta: texto.slice(tarea[0].length).trim(),
        },
      });
    }
    return resultado;
  }

  const encabezado = ENCABEZADO.exec(texto);
  if (encabezado !== null) {
    const nivel = (encabezado[1] ?? "#").length;
    resultado.push({ tipo: "linea", desde: linea.inicio, clase: claseEncabezado(nivel) });
    if (!esLineaCursor) {
      resultado.push({
        tipo: "ocultar",
        desde: linea.inicio,
        hasta: linea.inicio + encabezado[0].length,
      });
    }
    return resultado;
  }

  const cita = CITA.exec(texto);
  if (cita !== null) {
    resultado.push({ tipo: "linea", desde: linea.inicio, clase: CLASE_CITA });
    if (!esLineaCursor) {
      resultado.push({
        tipo: "ocultar",
        desde: linea.inicio,
        hasta: linea.inicio + cita[0].length,
      });
    }
    return resultado;
  }

  if (texto.trim() !== "" && REGLA.test(texto)) {
    resultado.push({ tipo: "linea", desde: linea.inicio, clase: CLASE_REGLA });
    if (!esLineaCursor) {
      resultado.push({ tipo: "ocultar", desde: linea.inicio, hasta: linea.fin });
    }
    return resultado;
  }

  const vineta = VINETA.exec(texto);
  if (vineta !== null) {
    resultado.push({ tipo: "linea", desde: linea.inicio, clase: CLASE_LISTA });
    if (!esLineaCursor) {
      const desde = linea.inicio + (vineta[1] ?? "").length;
      resultado.push({
        tipo: "widget",
        desde,
        hasta: desde + 1,
        widget: { tipo: "marcador", texto: "•" },
      });
    }
    return resultado;
  }

  if (NUMERADA.test(texto)) {
    resultado.push({ tipo: "linea", desde: linea.inicio, clase: CLASE_LISTA });
  }

  return resultado;
};

export const calcularDecoraciones = (
  texto: string,
  cursor: number,
): readonly DecoracionLivePreview[] => {
  const lineas = lineasDe(texto);
  const posicion = cursor < 0 ? -1 : Math.min(cursor, texto.length);
  const indiceCursor = indiceDeLinea(lineas, posicion);
  const bloques = bloquesDeCodigo(lineas);
  const bloqueCursor = indiceCursor === -1 ? undefined : bloques[indiceCursor];
  const decoraciones: DecoracionLivePreview[] = [];

  for (let indice = 0; indice < lineas.length; indice += 1) {
    const linea = lineas[indice];
    if (linea === undefined) {
      continue;
    }
    const bloque = bloques[indice];
    if (bloque !== undefined) {
      if (bloqueCursor !== undefined && bloque === bloqueCursor) {
        continue;
      }
      decoraciones.push({ tipo: "linea", desde: linea.inicio, clase: CLASE_CODIGO });
      if (BLOQUE_CODIGO.test(linea.texto)) {
        decoraciones.push({ tipo: "linea", desde: linea.inicio, clase: CLASE_CODIGO_BORDE });
      }
      continue;
    }
    decoraciones.push(...decoracionesBloque(linea, indice === indiceCursor));
    decoraciones.push(...decoracionesInline(linea.texto, linea.inicio, posicion));
  }

  return decoraciones;
};
