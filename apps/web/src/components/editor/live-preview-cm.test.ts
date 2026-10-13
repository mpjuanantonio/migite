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
    const widget = crearWidget({ tipo: "checkbox", marcado: false }, {});
    const dom = widget.toDOM(vista) as HTMLInputElement;

    expect(dom.checked).toBe(false);
    dom.dispatchEvent(new Event("change"));
    expect(cambios).toEqual([{ from: 2, to: 5, insert: "[x]" }]);
  });

  it("desmarca una tarea ya marcada", () => {
    const { vista, cambios } = crearVistaFalsa("- [x] comprar pan", 5);
    const widget = crearWidget({ tipo: "checkbox", marcado: true }, {});
    const dom = widget.toDOM(vista) as HTMLInputElement;

    dom.dispatchEvent(new Event("change"));
    expect(cambios).toEqual([{ from: 2, to: 5, insert: "[ ]" }]);
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
