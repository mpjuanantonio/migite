import { describe, expect, it } from "vitest";
import {
  contextoWikilink,
  insertarWikilink,
  type NodoMarkdown,
  nodosWikilink,
  opcionesWikilink,
  parseWikilink,
  remarkWikilinks,
  tituloSeguroParaWikilink,
} from "./wikilinks";

describe("parseWikilink", () => {
  it("extrae el título", () => {
    expect(parseWikilink("Cuaderno de campo")).toEqual({
      titulo: "Cuaderno de campo",
      etiqueta: "Cuaderno de campo",
    });
  });

  it("separa el alias", () => {
    expect(parseWikilink("Cuaderno de campo|el cuaderno")).toEqual({
      titulo: "Cuaderno de campo",
      etiqueta: "el cuaderno",
    });
  });

  it("separa el ancla conservándola en la etiqueta", () => {
    expect(parseWikilink("Cuaderno#Diario")).toEqual({
      titulo: "Cuaderno",
      etiqueta: "Cuaderno#Diario",
    });
  });

  it("prefiere el alias al ancla", () => {
    expect(parseWikilink("Cuaderno#Diario|hoy")).toEqual({
      titulo: "Cuaderno",
      etiqueta: "hoy",
    });
  });
});

describe("tituloSeguroParaWikilink", () => {
  it("acepta títulos que no rompen el patrón", () => {
    expect(tituloSeguroParaWikilink("Cuaderno de campo")).toBe(true);
    expect(tituloSeguroParaWikilink("Proyecto (beta)")).toBe(true);
  });

  it("rechaza corchetes, alias, anclas, saltos y espacios extremos", () => {
    expect(tituloSeguroParaWikilink("Proyecto [beta]")).toBe(false);
    expect(tituloSeguroParaWikilink("A|B")).toBe(false);
    expect(tituloSeguroParaWikilink("A#B")).toBe(false);
    expect(tituloSeguroParaWikilink("A\nB")).toBe(false);
    expect(tituloSeguroParaWikilink(" A")).toBe(false);
    expect(tituloSeguroParaWikilink("A ")).toBe(false);
    expect(tituloSeguroParaWikilink("")).toBe(false);
  });
});

describe("contextoWikilink", () => {
  it("detecta un enlace abierto al final", () => {
    expect(contextoWikilink("Hola [[Cua")).toEqual({ desde: 5, consulta: "Cua" });
  });

  it("detecta la apertura recién escrita", () => {
    expect(contextoWikilink("[[")).toEqual({ desde: 0, consulta: "" });
  });

  it("ignora los enlaces cerrados", () => {
    expect(contextoWikilink("Hola [[Cua]] y más")).toBeUndefined();
  });

  it("ignora si hay un salto de línea", () => {
    expect(contextoWikilink("Hola [[Cua\nresto")).toBeUndefined();
  });
});

describe("opcionesWikilink", () => {
  it("filtra por título sin distinguir mayúsculas", () => {
    expect(opcionesWikilink(["Diario de viaje", "Tareas del mes"], "dia")).toEqual([
      { tipo: "objeto", titulo: "Diario de viaje" },
    ]);
  });

  it("limita el número de coincidencias", () => {
    const titulos = ["uno", "dos", "tres"];
    expect(opcionesWikilink(titulos, "", 2)).toEqual([
      { tipo: "objeto", titulo: "uno" },
      { tipo: "objeto", titulo: "dos" },
    ]);
  });

  it("ofrece crear cuando no hay coincidencias", () => {
    expect(opcionesWikilink(["Diario de viaje"], "Zeta")).toEqual([
      { tipo: "crear", consulta: "Zeta" },
    ]);
  });

  it("no ofrece crear con la consulta vacía", () => {
    expect(opcionesWikilink([], "")).toEqual([]);
  });
});

describe("insertarWikilink", () => {
  it("reemplaza la consulta por el enlace completo", () => {
    expect(insertarWikilink("Hola [[Cua", { desde: 5, consulta: "Cua" }, "Cuaderno")).toBe(
      "Hola [[Cuaderno]]",
    );
  });
});

describe("nodosWikilink", () => {
  it("convierte texto plano y wikilinks", () => {
    expect(nodosWikilink("Ver [[Cuaderno|el cuaderno]] hoy")).toEqual([
      { type: "text", value: "Ver " },
      {
        type: "link",
        url: "/objetos/Cuaderno",
        children: [{ type: "text", value: "el cuaderno" }],
      },
      { type: "text", value: " hoy" },
    ]);
  });
});

describe("remarkWikilinks", () => {
  it("transforma los nodos de texto del árbol", () => {
    const arbol: NodoMarkdown = {
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value: "[[Cuaderno]]" }] }],
    };
    remarkWikilinks()(arbol);
    expect(arbol.children?.[0]?.children).toEqual([
      {
        type: "link",
        url: "/objetos/Cuaderno",
        children: [{ type: "text", value: "Cuaderno" }],
      },
    ]);
  });

  it("no transforma dentro de código", () => {
    const arbol: NodoMarkdown = {
      type: "root",
      children: [
        { type: "inlineCode", value: "[[Cuaderno]]" },
        { type: "code", value: "[[Cuaderno]]" },
      ],
    };
    remarkWikilinks()(arbol);
    expect(arbol.children).toEqual([
      { type: "inlineCode", value: "[[Cuaderno]]" },
      { type: "code", value: "[[Cuaderno]]" },
    ]);
  });
});
