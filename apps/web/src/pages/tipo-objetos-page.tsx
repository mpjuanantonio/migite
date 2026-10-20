import type { ObjectPayload } from "@migite/contracts";
import { ArrowLeft, ChevronRight, Folder, Pencil, Plus, Shapes } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "@/api/api";
import { useObjetosInfinitos, useTipos } from "@/api/hooks";
import { AltaObjetoDialog } from "@/components/objetos/alta-objeto";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import { formatFecha } from "@/lib/fecha";

const LIMITE = 20;

export const TipoObjetosPage = () => {
  const { t, locale } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const tipos = useTipos();
  const [altaAbierta, setAltaAbierta] = useState(false);

  const lista = useObjetosInfinitos({ tipo: id ?? "", limite: LIMITE });

  const objetos = useMemo(() => {
    const vistos = new Set<string>();
    const resultado: ObjectPayload[] = [];
    for (const pagina of lista.data?.pages ?? []) {
      for (const objeto of pagina.objetos) {
        if (vistos.has(objeto.id)) {
          continue;
        }
        vistos.add(objeto.id);
        resultado.push(objeto);
      }
    }
    return resultado;
  }, [lista.data]);

  const tipo = tipos.data?.find((item) => item.id === id);

  if (tipos.isPending) {
    return (
      <section
        aria-busy="true"
        className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet"
      >
        <p role="status" className="text-sm text-muted-foreground">
          {t("page.tipo.loading")}
        </p>
      </section>
    );
  }

  if (tipos.isError || tipo === undefined) {
    return (
      <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
        <h1 className="font-heading text-display font-medium">{t("page.tipo.notFound")}</h1>
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">
          {tipos.isError
            ? tipos.error instanceof ApiError
              ? tipos.error.mensaje
              : t("error.genericError")
            : t("page.tipoObjetos.notFoundHint", { id: id ?? "" })}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void tipos.refetch()}>
            {t("page.tipoObjetos.retry")}
          </Button>
          <Button asChild variant="ghost">
            <Link to="/tipos">
              <ArrowLeft aria-hidden="true" />
              {t("page.tipo.back")}
            </Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="font-heading text-display font-medium">{tipo.nombre}</h1>
          <Link
            to={`/tipos/${encodeURIComponent(tipo.id)}`}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Pencil aria-hidden="true" className="size-3" />
            {t("page.tipo.editTitle")}
          </Link>
        </div>
        <Button type="button" onClick={() => setAltaAbierta(true)}>
          <Plus aria-hidden="true" />
          {t("page.tipoObjetos.new")}
        </Button>
      </header>

      {altaAbierta ? (
        <AltaObjetoDialog
          tipoInicial={tipo.id}
          tipoFijo
          onCerrar={() => setAltaAbierta(false)}
          onCreado={(nuevoId) => navigate(`/objetos/${encodeURIComponent(nuevoId)}`)}
        />
      ) : null}

      {lista.isPending ? (
        <section
          aria-busy="true"
          className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet"
        >
          <p role="status" className="text-sm text-muted-foreground">
            {t("page.tipoObjetos.loading")}
          </p>
        </section>
      ) : null}

      {lista.isError ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <h2 className="font-heading text-xl font-medium">{t("page.tipoObjetos.loadError")}</h2>
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            {lista.error instanceof ApiError ? lista.error.mensaje : t("error.genericError")}
          </p>
          <Button variant="outline" className="mt-6" onClick={() => void lista.refetch()}>
            {t("page.tipoObjetos.retry")}
          </Button>
        </section>
      ) : null}

      {lista.isSuccess && objetos.length === 0 ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <Shapes aria-hidden="true" className="size-6 text-primary" strokeWidth={1.5} />
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            {t("page.tipoObjetos.empty")}
          </p>
        </section>
      ) : null}

      {lista.isSuccess && objetos.length > 0 ? (
        <ul aria-label={t("page.tipoObjetos.listLabel")} className="flex flex-col gap-3">
          {objetos.map((objeto) => (
            <li key={objeto.id}>
              <Link
                to={`/objetos/${encodeURIComponent(objeto.id)}`}
                className="group flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3.5 shadow-sheet transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <div className="min-w-0">
                  <h2 className="truncate font-heading text-lg font-medium group-hover:text-primary">
                    {objeto.titulo}
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <time dateTime={objeto.actualizado}>
                      {formatFecha(objeto.actualizado, locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                    <span aria-hidden="true" className="h-3 w-px bg-border" />
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <Folder aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.75} />
                      <span className="truncate">
                        {objeto.carpeta === "" ? t("page.notas.noFolder") : objeto.carpeta}
                      </span>
                    </span>
                  </p>
                </div>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {lista.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => void lista.fetchNextPage()}
            disabled={lista.isFetchingNextPage}
          >
            {lista.isFetchingNextPage
              ? t("page.tipoObjetos.loadingMore")
              : t("page.tipoObjetos.loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
