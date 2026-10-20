import { Plus, Shapes } from "lucide-react";
import { Link } from "react-router-dom";
import { ApiError } from "@/api/api";
import { useTipos } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import { esTipoSistema } from "@/lib/tipos";

export const TiposPage = () => {
  const { t } = useI18n();
  const tipos = useTipos();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="font-heading text-display font-medium">{t("page.tipos.title")}</h1>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            {t("page.tipos.description")}
          </p>
        </div>
        <Button asChild>
          <Link to="/tipos/nuevo">
            <Plus aria-hidden="true" />
            {t("page.tipos.newType")}
          </Link>
        </Button>
      </header>

      {tipos.isPending ? (
        <section
          aria-busy="true"
          className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet"
        >
          <p role="status" className="text-sm text-muted-foreground">
            {t("page.tipos.loading")}
          </p>
        </section>
      ) : null}

      {tipos.isError ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <h2 className="font-heading text-xl font-medium">{t("page.tipos.loadError")}</h2>
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            {tipos.error instanceof ApiError ? tipos.error.mensaje : t("error.genericError")}
          </p>
          <Button variant="outline" className="mt-6" onClick={() => void tipos.refetch()}>
            {t("page.tipos.retry")}
          </Button>
        </section>
      ) : null}

      {tipos.isSuccess && tipos.data.length === 0 ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <Shapes aria-hidden="true" className="size-6 text-primary" strokeWidth={1.5} />
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">{t("page.tipos.empty")}</p>
        </section>
      ) : null}

      {tipos.isSuccess && tipos.data.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {tipos.data.map((tipo) => (
            <li key={tipo.id}>
              <article className="flex h-full flex-col rounded-lg border border-border bg-card px-4 py-3.5 shadow-sheet">
                <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 font-heading text-lg font-medium">
                  <Link
                    to={`/tipos/${encodeURIComponent(tipo.id)}`}
                    className="rounded-sm transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {tipo.nombre}
                  </Link>
                  {esTipoSistema(tipo.id) ? (
                    <span className="inline-flex items-center rounded-sm border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {t("page.tipos.system")}
                    </span>
                  ) : null}
                </h2>
                <p className="mt-1 line-clamp-2 max-w-prose text-sm text-muted-foreground">
                  {tipo.descripcion?.trim() === "" || tipo.descripcion === undefined
                    ? t("page.tipos.noDescription")
                    : tipo.descripcion}
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <code className="rounded-sm bg-muted px-1 py-0.5">{tipo.id}</code>
                  <span aria-hidden="true" className="h-3 w-px bg-border" />
                  <span>{t("page.tipos.attributeCount", { total: tipo.atributos.length })}</span>
                </p>
              </article>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
