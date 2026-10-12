import type { ReactNode } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "@/api/api";
import { useCrearObjeto, useResolverObjeto } from "@/api/hooks";
import { useI18n } from "@/i18n/context";

type WikilinkProps = {
  readonly titulo: string;
  readonly children: ReactNode;
  readonly antesDeCrear?: () => Promise<void>;
};

export const Wikilink = ({ titulo, children, antesDeCrear }: WikilinkProps) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const resolucion = useResolverObjeto(titulo);
  const crear = useCrearObjeto();
  const [preparando, setPreparando] = useState(false);

  const crearNota = async () => {
    if (crear.isPending || preparando) {
      return;
    }
    if (antesDeCrear !== undefined) {
      setPreparando(true);
      try {
        await antesDeCrear();
      } catch {
        return;
      } finally {
        setPreparando(false);
      }
    }
    crear.mutate(
      { titulo },
      {
        onSuccess: (objeto) => navigate(`/objetos/${encodeURIComponent(objeto.id)}`),
      },
    );
  };

  if (resolucion.isPending) {
    return <span className="text-muted-foreground">{children}</span>;
  }

  const objeto = resolucion.data;
  if (objeto !== null && objeto !== undefined) {
    const destino = `/objetos/${encodeURIComponent(objeto.id)}`;
    return (
      <a
        href={destino}
        onClick={(event) => {
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
            return;
          }
          event.preventDefault();
          navigate(destino);
        }}
      >
        {children}
      </a>
    );
  }

  if (resolucion.isError) {
    return <span className="text-muted-foreground">{children}</span>;
  }

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span
        title={t("page.objeto.wikilink.unresolved", { titulo })}
        className="border-b border-dashed border-muted-foreground/70 text-muted-foreground"
      >
        {children}
      </span>
      <button
        type="button"
        disabled={crear.isPending || preparando}
        onClick={() => void crearNota()}
        className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-sans text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
      >
        {crear.isPending || preparando
          ? t("page.objeto.wikilink.creating")
          : t("page.objeto.wikilink.create")}
      </button>
      {crear.isError ? (
        <span role="alert" className="font-sans text-xs text-destructive">
          {crear.error instanceof ApiError
            ? crear.error.mensaje
            : t("page.objeto.wikilink.createError")}
        </span>
      ) : null}
    </span>
  );
};
