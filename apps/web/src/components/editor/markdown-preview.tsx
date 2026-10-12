import { type ComponentProps, useMemo } from "react";
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

type MarkdownPreviewProps = {
  readonly markdown: string;
  readonly emptyLabel: string;
  readonly enlacesWikilink?: boolean;
  readonly antesDeCrearEnlace?: () => Promise<void>;
};

export const MarkdownPreview = ({
  markdown,
  emptyLabel,
  enlacesWikilink = false,
  antesDeCrearEnlace,
}: MarkdownPreviewProps) => {
  const componentes = useMemo<Components>(
    () => ({
      a: ({ href, children }: ComponentProps<"a">) =>
        href?.startsWith(PREFIJO_OBJETOS) ? (
          <Wikilink
            titulo={decodificar(href.slice(PREFIJO_OBJETOS.length))}
            antesDeCrear={antesDeCrearEnlace}
          >
            {children}
          </Wikilink>
        ) : (
          <a href={href}>{children}</a>
        ),
    }),
    [antesDeCrearEnlace],
  );

  if (markdown.trim() === "") {
    return <p className="max-w-prose text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="prose-archivo">
      <ReactMarkdown
        remarkPlugins={enlacesWikilink ? [remarkGfm, remarkWikilinks] : [remarkGfm]}
        components={enlacesWikilink ? componentes : undefined}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
};
