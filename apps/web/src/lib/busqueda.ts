import type { SearchResultItem } from "@migite/contracts";

export type GrupoResultados = {
  readonly tipo: string;
  readonly resultados: readonly SearchResultItem[];
};

export const agruparResultados = (
  resultados: readonly SearchResultItem[],
): readonly GrupoResultados[] => {
  const grupos = new Map<string, SearchResultItem[]>();
  for (const resultado of resultados) {
    const existente = grupos.get(resultado.tipo);
    if (existente === undefined) {
      grupos.set(resultado.tipo, [resultado]);
    } else {
      existente.push(resultado);
    }
  }
  return [...grupos].map(([tipo, items]) => ({ tipo, resultados: items }));
};

export type ParteFragmento = {
  readonly inicio: number;
  readonly texto: string;
  readonly coincide: boolean;
};

const escaparRegex = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const partirFragmento = (fragmento: string, terminos: string): readonly ParteFragmento[] => {
  const palabras = terminos
    .split(/\s+/)
    .map((palabra) => palabra.trim())
    .filter((palabra) => palabra !== "")
    .map(escaparRegex);
  if (palabras.length === 0 || fragmento === "") {
    return [{ inicio: 0, texto: fragmento, coincide: false }];
  }
  const patron = new RegExp(palabras.join("|"), "gi");
  const partes: ParteFragmento[] = [];
  let ultimo = 0;
  for (const coincidencia of fragmento.matchAll(patron)) {
    const inicio = coincidencia.index ?? 0;
    if (inicio > ultimo) {
      partes.push({ inicio: ultimo, texto: fragmento.slice(ultimo, inicio), coincide: false });
    }
    partes.push({ inicio, texto: coincidencia[0], coincide: true });
    ultimo = inicio + coincidencia[0].length;
  }
  if (ultimo < fragmento.length) {
    partes.push({ inicio: ultimo, texto: fragmento.slice(ultimo), coincide: false });
  }
  return partes;
};
