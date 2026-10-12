import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkWikilinks } from "@/lib/wikilinks";
import { Wikilink } from "./wikilink";

const PREFIJO_OBJETOS = "/objetos/";

const decodificar = (valor: string): string => {
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
};

const EnlaceMarkdown = ({ href, children }: ComponentProps<"a">) => {
  if (href?.startsWith(PREFIJO_OBJETOS)) {
    return <Wikilink titulo={decodificar(href.slice(PREFIJO_OBJETOS.length))}>{children}</Wikilink>;
  }
  return <a href={href}>{children}</a>;
};

const COMPONENTES: Components = { a: EnlaceMarkdown };

type MarkdownPreviewProps = {
  readonly markdown: string;
  readonly emptyLabel: string;
  readonly enlacesWikilink?: boolean;
};

export const MarkdownPreview = ({
  markdown,
  emptyLabel,
  enlacesWikilink = false,
}: MarkdownPreviewProps) => {
  if (markdown.trim() === "") {
    return <p className="max-w-prose text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="prose-archivo">
      <ReactMarkdown
        remarkPlugins={enlacesWikilink ? [remarkGfm, remarkWikilinks] : [remarkGfm]}
        components={enlacesWikilink ? COMPONENTES : undefined}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
};
