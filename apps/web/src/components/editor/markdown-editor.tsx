import { markdown } from "@codemirror/lang-markdown";
import CodeMirror, { EditorView, oneDark } from "@uiw/react-codemirror";
import { cn } from "cn";
import { type KeyboardEvent, useMemo, useState } from "react";
import { useI18n } from "@/i18n/context";
import {
  contextoWikilink,
  insertarWikilink,
  type OpcionWikilink,
  opcionesWikilink,
} from "@/lib/wikilinks";
import { useTema } from "@/theme/context";
import { extensionLivePreview, TEMA_LIVE_PREVIEW } from "./live-preview-cm";

const TEMA_OSCURO = [
  oneDark,
  EditorView.theme(
    {
      "&.cm-editor": {
        backgroundColor: "var(--card)",
        color: "var(--foreground)",
      },
      "&.cm-editor .cm-content": {
        caretColor: "var(--primary)",
      },
      "&.cm-editor .cm-cursor, &.cm-editor .cm-dropCursor": {
        borderLeftColor: "var(--primary)",
      },
      "&.cm-editor .cm-selectionBackground, &.cm-editor .cm-content ::selection": {
        backgroundColor: "color-mix(in oklab, var(--primary) 26%, transparent)",
      },
    },
    { dark: true },
  ),
];

type MarkdownEditorProps = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly ariaLabel: string;
  readonly placeholder?: string;
  readonly sugerencias?: readonly string[];
  readonly onWikilinkClick?: (titulo: string) => void;
};

export const MarkdownEditor = ({
  value,
  onChange,
  ariaLabel,
  placeholder,
  sugerencias = [],
  onWikilinkClick,
}: MarkdownEditorProps) => {
  const { modoEfectivo } = useTema();
  const { t } = useI18n();
  const [indice, setIndice] = useState(0);
  const [consultaPrevia, setConsultaPrevia] = useState<string>();
  const [descartadoPara, setDescartadoPara] = useState<string>();

  const extensiones = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": ariaLabel, "aria-multiline": "true" }),
      TEMA_LIVE_PREVIEW,
      extensionLivePreview({
        alHacerClicWikilink: onWikilinkClick,
        etiquetaCasilla: t("page.tareas.title"),
      }),
    ],
    [ariaLabel, onWikilinkClick, t],
  );

  const contexto = contextoWikilink(value);
  const opciones =
    contexto === undefined || descartadoPara === value
      ? []
      : opcionesWikilink(sugerencias, contexto.consulta);
  const indiceActivo = opciones.length === 0 ? 0 : Math.min(indice, opciones.length - 1);

  if (contexto?.consulta !== consultaPrevia) {
    setConsultaPrevia(contexto?.consulta);
    setIndice(0);
  }

  const insertar = (opcion: OpcionWikilink) => {
    if (contexto === undefined) {
      return;
    }
    const texto = opcion.tipo === "objeto" ? opcion.titulo : opcion.consulta;
    onChange(insertarWikilink(value, contexto, texto));
    setDescartadoPara(undefined);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (opciones.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      setIndice((actual) => (actual + 1) % opciones.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      setIndice((actual) => (actual - 1 + opciones.length) % opciones.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const opcion = opciones[indiceActivo];
      if (opcion !== undefined) {
        insertar(opcion);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setDescartadoPara(value);
    }
  };

  return (
    <div className="relative h-full" onKeyDownCapture={onKeyDown}>
      <CodeMirror
        className="h-full"
        value={value}
        onChange={onChange}
        aria-label={ariaLabel}
        placeholder={placeholder}
        theme={modoEfectivo === "dark" ? TEMA_OSCURO : "none"}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          autocompletion: false,
          closeBrackets: false,
        }}
        extensions={extensiones}
      />
      {opciones.length > 0 ? (
        <div
          role="listbox"
          aria-label={t("page.objeto.wikilink.suggestions")}
          className="absolute bottom-3 left-3 z-20 max-h-44 w-72 overflow-y-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md"
        >
          {opciones.map((opcion, posicion) => (
            <button
              key={
                opcion.tipo === "objeto" ? `objeto:${opcion.titulo}` : `crear:${opcion.consulta}`
              }
              type="button"
              role="option"
              aria-selected={posicion === indiceActivo}
              className={cn(
                "block w-full cursor-pointer px-3 py-1.5 text-left",
                posicion === indiceActivo
                  ? "bg-accent text-accent-foreground"
                  : "text-popover-foreground hover:bg-accent/60",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertar(opcion)}
            >
              {opcion.tipo === "objeto"
                ? opcion.titulo
                : t("page.objeto.wikilink.suggestionCreate", { titulo: opcion.consulta })}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
