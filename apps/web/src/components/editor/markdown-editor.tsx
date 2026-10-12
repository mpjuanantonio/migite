import { markdown } from "@codemirror/lang-markdown";
import CodeMirror, { EditorView, oneDark } from "@uiw/react-codemirror";
import { useTema } from "@/theme/context";

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
};

export const MarkdownEditor = ({
  value,
  onChange,
  ariaLabel,
  placeholder,
}: MarkdownEditorProps) => {
  const { modoEfectivo } = useTema();

  return (
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
      }}
      extensions={[
        markdown(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ "aria-label": ariaLabel, "aria-multiline": "true" }),
      ]}
    />
  );
};
