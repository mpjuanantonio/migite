import {
  Decoration,
  type DecorationSet,
  EditorView,
  type Range,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@uiw/react-codemirror";
import {
  CLASE_CITA,
  CLASE_CODIGO,
  CLASE_CODIGO_BORDE,
  CLASE_CODIGO_INLINE,
  CLASE_CURSIVA,
  CLASE_LISTA,
  CLASE_NEGRITA,
  CLASE_REGLA,
  CLASE_TACHADO,
  CLASE_TAREA,
  CLASE_TAREA_HECHA,
  calcularDecoraciones,
  claseEncabezado,
  type DecoracionLivePreview,
  type WidgetLivePreview,
} from "./live-preview";

export type OpcionesLivePreview = {
  readonly alHacerClicWikilink?: (titulo: string) => void;
};

const alternarTarea = (view: EditorView, entrada: HTMLElement): void => {
  const linea = view.state.doc.lineAt(view.posAtDOM(entrada));
  const coincidencia = /^(\s*[-*+]\s+)\[([ xX])\]/.exec(linea.text);
  if (coincidencia === null) {
    return;
  }
  const desde = linea.from + (coincidencia[1] ?? "").length;
  const hasta = desde + 3;
  const actual = view.state.sliceDoc(desde, hasta);
  const insertar = actual === "[x]" || actual === "[X]" ? "[ ]" : "[x]";
  view.dispatch({ changes: { from: desde, to: hasta, insert: insertar } });
};

class WidgetWikilink extends WidgetType {
  private readonly titulo: string;
  private readonly etiqueta: string;
  private readonly alHacerClic: ((titulo: string) => void) | undefined;

  constructor(
    titulo: string,
    etiqueta: string,
    alHacerClic: ((titulo: string) => void) | undefined,
  ) {
    super();
    this.titulo = titulo;
    this.etiqueta = etiqueta;
    this.alHacerClic = alHacerClic;
  }

  override eq(other: WidgetWikilink): boolean {
    return this.titulo === other.titulo && this.etiqueta === other.etiqueta;
  }

  override toDOM(): HTMLElement {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "cm-lp-wikilink";
    boton.textContent = this.etiqueta;
    boton.title = this.titulo;
    boton.addEventListener("mousedown", (evento) => evento.preventDefault());
    boton.addEventListener("click", (evento) => {
      evento.preventDefault();
      evento.stopPropagation();
      this.alHacerClic?.(this.titulo);
    });
    return boton;
  }
}

class WidgetCheckbox extends WidgetType {
  private readonly marcado: boolean;
  private readonly etiqueta: string;

  constructor(marcado: boolean, etiqueta: string) {
    super();
    this.marcado = marcado;
    this.etiqueta = etiqueta;
  }

  override eq(other: WidgetCheckbox): boolean {
    return this.marcado === other.marcado && this.etiqueta === other.etiqueta;
  }

  override toDOM(view: EditorView): HTMLElement {
    const entrada = document.createElement("input");
    entrada.type = "checkbox";
    entrada.checked = this.marcado;
    entrada.className = "cm-lp-checkbox";
    if (this.etiqueta !== "") {
      entrada.setAttribute("aria-label", this.etiqueta);
    }
    entrada.addEventListener("mousedown", (evento) => evento.preventDefault());
    entrada.addEventListener("change", () => alternarTarea(view, entrada));
    return entrada;
  }
}

class WidgetEnlace extends WidgetType {
  private readonly texto: string;
  private readonly url: string;

  constructor(texto: string, url: string) {
    super();
    this.texto = texto;
    this.url = url;
  }

  override eq(other: WidgetEnlace): boolean {
    return this.texto === other.texto && this.url === other.url;
  }

  override toDOM(): HTMLElement {
    const enlace = document.createElement("a");
    enlace.className = "cm-lp-enlace";
    enlace.href = this.url;
    enlace.target = "_blank";
    enlace.rel = "noreferrer noopener";
    enlace.textContent = this.texto;
    enlace.addEventListener("mousedown", (evento) => evento.preventDefault());
    enlace.addEventListener("click", (evento) => evento.stopPropagation());
    return enlace;
  }
}

class WidgetMarcador extends WidgetType {
  private readonly texto: string;

  constructor(texto: string) {
    super();
    this.texto = texto;
  }

  override eq(other: WidgetMarcador): boolean {
    return this.texto === other.texto;
  }

  override toDOM(): HTMLElement {
    const marcador = document.createElement("span");
    marcador.className = "cm-lp-marcador";
    marcador.textContent = this.texto;
    return marcador;
  }
}

export const crearWidget = (
  widget: WidgetLivePreview,
  opciones: OpcionesLivePreview,
): WidgetType => {
  switch (widget.tipo) {
    case "wikilink":
      return new WidgetWikilink(widget.titulo, widget.etiqueta, opciones.alHacerClicWikilink);
    case "checkbox":
      return new WidgetCheckbox(widget.marcado, widget.etiqueta);
    case "enlace":
      return new WidgetEnlace(widget.texto, widget.url);
    case "marcador":
      return new WidgetMarcador(widget.texto);
  }
};

const aRango = (
  decoracion: DecoracionLivePreview,
  opciones: OpcionesLivePreview,
): Range<Decoration> => {
  if (decoracion.tipo === "ocultar") {
    return Decoration.replace({}).range(decoracion.desde, decoracion.hasta);
  }
  if (decoracion.tipo === "marca") {
    return Decoration.mark({ class: decoracion.clase }).range(decoracion.desde, decoracion.hasta);
  }
  if (decoracion.tipo === "linea") {
    return Decoration.line({ class: decoracion.clase }).range(decoracion.desde);
  }
  return Decoration.replace({ widget: crearWidget(decoracion.widget, opciones) }).range(
    decoracion.desde,
    decoracion.hasta,
  );
};

const construirDecoraciones = (view: EditorView, opciones: OpcionesLivePreview): DecorationSet => {
  const cursor = view.hasFocus ? view.state.selection.main.head : -1;
  const decoraciones = calcularDecoraciones(view.state.doc.toString(), cursor).map((decoracion) =>
    aRango(decoracion, opciones),
  );
  return Decoration.set(decoraciones, true);
};

export const extensionLivePreview = (opciones: OpcionesLivePreview) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = construirDecoraciones(view, opciones);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.selectionSet || update.focusChanged) {
          this.decorations = construirDecoraciones(update.view, opciones);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );

export const TEMA_LIVE_PREVIEW = EditorView.theme({
  [`&.cm-editor .${CLASE_NEGRITA}`]: { fontWeight: "700" },
  [`&.cm-editor .${CLASE_CURSIVA}`]: { fontStyle: "italic" },
  [`&.cm-editor .${CLASE_TACHADO}`]: { textDecoration: "line-through" },
  [`&.cm-editor .${CLASE_CODIGO_INLINE}`]: {
    padding: "0.05em 0.35em",
    border: "1px solid var(--border)",
    borderRadius: "calc(var(--radius) * 0.6)",
    backgroundColor: "var(--muted)",
    fontSize: "0.9em",
  },
  [`&.cm-editor .${claseEncabezado(1)}`]: {
    fontFamily: "var(--font-heading)",
    fontSize: "1.5rem",
    fontWeight: "600",
    lineHeight: "1.35",
  },
  [`&.cm-editor .${claseEncabezado(2)}`]: {
    fontFamily: "var(--font-heading)",
    fontSize: "1.25rem",
    fontWeight: "600",
  },
  [`&.cm-editor .${claseEncabezado(3)}`]: {
    fontFamily: "var(--font-heading)",
    fontSize: "1.125rem",
    fontWeight: "600",
  },
  [`&.cm-editor .${claseEncabezado(4)}`]: { fontSize: "1rem", fontWeight: "600" },
  [`&.cm-editor .${claseEncabezado(5)}`]: { fontSize: "0.95rem", fontWeight: "600" },
  [`&.cm-editor .${claseEncabezado(6)}`]: {
    fontSize: "0.9rem",
    fontWeight: "600",
    color: "var(--muted-foreground)",
  },
  [`&.cm-editor .${CLASE_CITA}`]: {
    borderLeft: "3px solid var(--primary)",
    paddingLeft: "0.75rem",
    color: "var(--muted-foreground)",
    fontStyle: "italic",
  },
  [`&.cm-editor .${CLASE_LISTA}`]: { paddingLeft: "0.5rem" },
  [`&.cm-editor .${CLASE_TAREA}`]: { paddingLeft: "0.5rem" },
  [`&.cm-editor .${CLASE_TAREA}.${CLASE_TAREA_HECHA}`]: {
    color: "var(--muted-foreground)",
    textDecoration: "line-through",
  },
  [`&.cm-editor .${CLASE_REGLA}`]: {
    borderBottom: "1px solid var(--border)",
    minHeight: "1em",
  },
  [`&.cm-editor .${CLASE_CODIGO}`]: {
    backgroundColor: "var(--muted)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
  [`&.cm-editor .${CLASE_CODIGO_BORDE}`]: { color: "var(--muted-foreground)" },
  "&.cm-editor .cm-lp-wikilink": {
    padding: "0 0.3em",
    border: "none",
    borderRadius: "calc(var(--radius) * 0.6)",
    backgroundColor: "color-mix(in oklab, var(--primary) 12%, transparent)",
    color: "var(--primary)",
    font: "inherit",
    cursor: "pointer",
  },
  "&.cm-editor .cm-lp-enlace": {
    color: "var(--primary)",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
    cursor: "pointer",
  },
  "&.cm-editor .cm-lp-marcador": { color: "var(--muted-foreground)" },
  "&.cm-editor .cm-lp-checkbox": {
    marginRight: "0.35rem",
    verticalAlign: "middle",
    cursor: "pointer",
    accentColor: "var(--primary)",
  },
});
