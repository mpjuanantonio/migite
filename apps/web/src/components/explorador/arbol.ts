import type { ArbolObjetoNode } from "@migite/contracts";

export type CarpetaArbol = {
  readonly ruta: string;
  readonly nombre: string;
  readonly carpetas: readonly CarpetaArbol[];
  readonly notas: readonly ArbolObjetoNode[];
  readonly total: number;
};

type CarpetaEnConstruccion = {
  readonly ruta: string;
  readonly nombre: string;
  readonly hijas: Map<string, CarpetaEnConstruccion>;
  readonly notas: ArbolObjetoNode[];
};

const segmentosDe = (carpeta: string): readonly string[] =>
  carpeta.split("/").filter((segmento) => segmento !== "");

export const ancestrosDe = (carpeta: string): readonly string[] => {
  const segmentos = segmentosDe(carpeta);
  return segmentos.map((_segmento, indice) => segmentos.slice(0, indice + 1).join("/"));
};

const carpetaDe = (raiz: CarpetaEnConstruccion, carpeta: string): CarpetaEnConstruccion => {
  let actual = raiz;
  const ruta: string[] = [];
  for (const segmento of segmentosDe(carpeta)) {
    ruta.push(segmento);
    const clave = ruta.join("/");
    let siguiente = actual.hijas.get(clave);
    if (siguiente === undefined) {
      siguiente = { ruta: clave, nombre: segmento, hijas: new Map(), notas: [] };
      actual.hijas.set(clave, siguiente);
    }
    actual = siguiente;
  }
  return actual;
};

export const construirArbol = (nodos: readonly ArbolObjetoNode[], locale: string): CarpetaArbol => {
  const raiz: CarpetaEnConstruccion = { ruta: "", nombre: "", hijas: new Map(), notas: [] };

  for (const nodo of nodos) {
    carpetaDe(raiz, nodo.carpeta).notas.push(nodo);
  }

  const ordenar = (carpeta: CarpetaEnConstruccion): CarpetaArbol => {
    const notas = [...carpeta.notas].sort((a, b) => a.titulo.localeCompare(b.titulo, locale));
    const carpetas = [...carpeta.hijas.values()]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, locale))
      .map(ordenar);
    return {
      ruta: carpeta.ruta,
      nombre: carpeta.nombre,
      carpetas,
      notas,
      total: notas.length + carpetas.reduce((suma, hija) => suma + hija.total, 0),
    };
  };

  return ordenar(raiz);
};
