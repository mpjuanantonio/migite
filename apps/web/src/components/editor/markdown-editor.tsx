import { markdown } from "@codemirror/lang-markdown";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";

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
}: MarkdownEditorProps) => (
  <CodeMirror
    className="h-full"
    value={value}
    onChange={onChange}
    aria-label={ariaLabel}
    placeholder={placeholder}
    theme="none"
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
