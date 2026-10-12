export type Wikilink = {
  readonly titulo: string;
  readonly etiqueta: string;
};

export const parseWikilink = (interno: string): Wikilink => {
  const separador = interno.indexOf("|");
  const destino = (separador === -1 ? interno : interno.slice(0, separador)).trim();
  const alias = separador === -1 ? "" : interno.slice(separador + 1).trim();
  const titulo = (destino.split("#", 1)[0] ?? "").trim();
  return { titulo, etiqueta: alias === "" ? destino : alias };
};

export type ContextoWikilink = {
  readonly desde: number;
  readonly consulta: string;
};

export const contextoWikilink = (valor: string): ContextoWikilink | undefined => {
  const inicio = valor.lastIndexOf("[[");
  if (inicio === -1) {
    return undefined;
  }
  const resto = valor.slice(inicio + 2);
  if (resto.includes("]]") || resto.includes("[[") || resto.includes("\n")) {
    return undefined;
  }
  return { desde: inicio, consulta: resto };
};

export type OpcionWikilink =
  | { readonly tipo: "objeto"; readonly titulo: string }
  | { readonly tipo: "crear"; readonly consulta: string };

export const opcionesWikilink = (
  titulos: readonly string[],
  consulta: string,
  limite = 8,
): readonly OpcionWikilink[] => {
  const normalizada = consulta.trim().toLocaleLowerCase();
  const unicos = [...new Set(titulos)];
  const coincidencias = unicos
    .filter((titulo) => titulo.toLocaleLowerCase().includes(normalizada))
    .slice(0, limite)
    .map((titulo): OpcionWikilink => ({ tipo: "objeto", titulo }));
  if (coincidencias.length > 0 || normalizada === "") {
    return coincidencias;
  }
  return [{ tipo: "crear", consulta: consulta.trim() }];
};

export const insertarWikilink = (
  valor: string,
  contexto: ContextoWikilink,
  texto: string,
): string => `${valor.slice(0, contexto.desde)}[[${texto}]]`;

export type NodoMarkdown = {
  type: string;
  value?: string;
  url?: string;
  children?: NodoMarkdown[];
};

const WIKILINK = /\[\[([^\]\n]+)\]\]/g;

export const nodosWikilink = (texto: string): NodoMarkdown[] => {
  const nodos: NodoMarkdown[] = [];
  let ultimo = 0;
  for (const coincidencia of texto.matchAll(WIKILINK)) {
    const inicio = coincidencia.index ?? 0;
    if (inicio > ultimo) {
      nodos.push({ type: "text", value: texto.slice(ultimo, inicio) });
    }
    const { titulo, etiqueta } = parseWikilink(coincidencia[1] ?? "");
    nodos.push({
      type: "link",
      url: `/objetos/${encodeURIComponent(titulo)}`,
      children: [{ type: "text", value: etiqueta }],
    });
    ultimo = inicio + (coincidencia[0]?.length ?? 0);
  }
  if (ultimo < texto.length) {
    nodos.push({ type: "text", value: texto.slice(ultimo) });
  }
  return nodos;
};

const transformarNodo = (nodo: NodoMarkdown): void => {
  if (nodo.children === undefined || nodo.type === "code" || nodo.type === "inlineCode") {
    return;
  }
  const siguientes: NodoMarkdown[] = [];
  for (const hijo of nodo.children) {
    if (hijo.type === "text" && hijo.value !== undefined) {
      siguientes.push(...nodosWikilink(hijo.value));
      continue;
    }
    transformarNodo(hijo);
    siguientes.push(hijo);
  }
  nodo.children = siguientes;
};

export const remarkWikilinks =
  () =>
  (raiz: unknown): void => {
    transformarNodo(raiz as NodoMarkdown);
  };
