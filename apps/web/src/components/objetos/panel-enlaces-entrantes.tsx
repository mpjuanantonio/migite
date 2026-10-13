import type { EnlaceEntrante } from "@migite/contracts";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { ApiError } from "@/api/api";
import { useEnlacesEntrantes } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import type { AppTranslationKey } from "@/i18n/translate";

const CONTEXTO_KEYS = {
  body: "page.objeto.backlinks.contextBody",
  frontmatter: "page.objeto.backlinks.contextFrontmatter",
} as const satisfies Record<EnlaceEntrante["contexto"], AppTranslationKey>;

type PanelEnlacesEntrantesProps = {
  readonly id: string;
};

export const PanelEnlacesEntrantes = ({ id }: PanelEnlacesEntrantesProps) => {
  const { t } = useI18n();
  const consulta = useEnlacesEntrantes(id);
  const entrantes = consulta.data?.entrantes ?? [];

  return (
    <section aria-label={t("page.objeto.backlinks.title")} className="border-t border-border pt-3">
      <details open={entrantes.length > 0} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden="true"
            className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
          />
          <h2>{t("page.objeto.backlinks.title")}</h2>
          {consulta.isSuccess && entrantes.length > 0 ? (
            <span className="rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[0.7rem]">
              {entrantes.length}
            </span>
          ) : null}
        </summary>
        <div className="mt-2 pl-5">
          {consulta.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("page.objeto.backlinks.loading")}
            </p>
          ) : consulta.isError ? (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-destructive"
            >
              <p className="max-w-prose">
                <span className="font-medium">{t("page.objeto.backlinks.loadError")}. </span>
                {consulta.error instanceof ApiError
                  ? consulta.error.mensaje
                  : t("error.genericError")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void consulta.refetch()}
              >
                {t("page.objeto.backlinks.retry")}
              </Button>
            </div>
          ) : entrantes.length === 0 ? (
            <p className="max-w-prose text-sm text-muted-foreground">
              {t("page.objeto.backlinks.empty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {entrantes.map((entrante) => (
                <li
                  key={`${entrante.id}:${entrante.contexto}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
                >
                  <Link
                    to={`/objetos/${encodeURIComponent(entrante.id)}`}
                    className="rounded-sm font-medium transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {entrante.titulo}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {t(CONTEXTO_KEYS[entrante.contexto])}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </section>
  );
};
