import type { EditorView } from "@uiw/react-codemirror";
import { describe, expect, it, vi } from "vitest";
import { crearWidget, extensionLivePreview } from "./live-preview-cm";

const crearVistaFalsa = (texto: string, posicion: number) => {
  const cambios: { readonly from: number; readonly to: number; readonly insert: string }[] = [];
  const vista = {
    posAtDOM: () => posicion,
    state: {
      doc: { lineAt: () => ({ from: 0, text: texto }) },
      sliceDoc: (desde: number, hasta: number) => texto.slice(desde, hasta),
    },
    dispatch: (transaccion: {
      readonly changes?: { from: number; to: number; insert: string };
    }) => {
      if (transaccion.changes !== undefined) {
        cambios.push(transaccion.changes);
      }
    },
  };
  return { vista: vista as unknown as EditorView, cambios };
};

describe("widgets del live preview", () => {
  it("avisa al pulsar un wikilink con su título", () => {
    const alHacerClic = vi.fn();
    const widget = crearWidget(
      { tipo: "wikilink", titulo: "Diario de viaje", etiqueta: "el diario" },
      { alHacerClicWikilink: alHacerClic },
    );
    const dom = widget.toDOM(crearVistaFalsa("", 0).vista);

    expect(dom.textContent).toBe("el diario");
    dom.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(alHacerClic).toHaveBeenCalledWith("Diario de viaje");
  });

  it("alterna la tarea al cambiar el checkbox", () => {
    const { vista, cambios } = crearVistaFalsa("- [ ] comprar pan", 5);
    const widget = crearWidget({ tipo: "checkbox", marcado: false, etiqueta: "comprar pan" }, {});
    const dom = widget.toDOM(vista) as HTMLInputElement;

    expect(dom.checked).toBe(false);
    expect(dom.getAttribute("aria-label")).toBe("comprar pan");
    dom.dispatchEvent(new Event("change"));
    expect(cambios).toEqual([{ from: 2, to: 5, insert: "[x]" }]);
  });

  it("desmarca una tarea ya marcada", () => {
    const { vista, cambios } = crearVistaFalsa("- [x] comprar pan", 5);
    const widget = crearWidget({ tipo: "checkbox", marcado: true, etiqueta: "comprar pan" }, {});
    const dom = widget.toDOM(vista) as HTMLInputElement;

    dom.dispatchEvent(new Event("change"));
    expect(cambios).toEqual([{ from: 2, to: 5, insert: "[ ]" }]);
  });

  it("omite la etiqueta cuando la línea no tiene texto", () => {
    const widget = crearWidget({ tipo: "checkbox", marcado: false, etiqueta: "" }, {});
    const dom = widget.toDOM(crearVistaFalsa("- [ ]", 5).vista) as HTMLInputElement;

    expect(dom.hasAttribute("aria-label")).toBe(false);
  });

  it("compara los checkboxes también por su etiqueta", () => {
    const primero = crearWidget({ tipo: "checkbox", marcado: false, etiqueta: "una" }, {});
    const segundo = crearWidget({ tipo: "checkbox", marcado: false, etiqueta: "otra" }, {});

    expect(primero.eq(segundo)).toBe(false);
  });

  it("renderiza enlaces externos como anclas seguras", () => {
    const widget = crearWidget({ tipo: "enlace", texto: "guía", url: "https://ejemplo.dev" }, {});
    const dom = widget.toDOM(crearVistaFalsa("", 0).vista) as HTMLAnchorElement;

    expect(dom.getAttribute("href")).toBe("https://ejemplo.dev");
    expect(dom.target).toBe("_blank");
    expect(dom.textContent).toBe("guía");
  });

  it("la extensión de live preview se puede construir", () => {
    expect(extensionLivePreview({})).toBeDefined();
  });
});
