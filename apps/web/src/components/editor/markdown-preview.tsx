import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownPreviewProps = {
  readonly markdown: string;
  readonly emptyLabel: string;
};

export const MarkdownPreview = ({ markdown, emptyLabel }: MarkdownPreviewProps) => {
  if (markdown.trim() === "") {
    return <p className="max-w-prose text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="prose-archivo">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
};
