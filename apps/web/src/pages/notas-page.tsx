import type { ObjectPayload } from "@migite/contracts";
import { ChevronRight, FileWarning, Folder, NotebookPen, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "@/api/api";
import { useCrearObjeto, useObjetosInfinitos } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import { formatFecha } from "@/lib/fecha";

const LIMITE = 20;

export const NotasPage = () => {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [carpeta, setCarpeta] = useState<string | undefined>(undefined);
  const [carpetas, setCarpetas] = useState<readonly string[]>([]);
  const crear = useCrearObjeto();

  const lista = useObjetosInfinitos({
    limite: LIMITE,
    ...(carpeta === undefined ? {} : { carpeta }),
  });

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

  useEffect(() => {
    setCarpetas((previas) => {
      const conjunto = new Set(previas);
      for (const objeto of objetos) {
        if (objeto.carpeta !== "") {
          conjunto.add(objeto.carpeta);
        }
      }
      if (conjunto.size === previas.length) {
        return previas;
      }
      return [...conjunto].sort((a, b) => a.localeCompare(b, locale));
    });
  }, [objetos, locale]);

  const visibles = useMemo(
    () => (carpeta === "" ? objetos.filter((objeto) => objeto.carpeta === "") : objetos),
    [carpeta, objetos],
  );

  const crearNota = () => {
    crear.mutate(
      { titulo: t("page.notas.newNoteTitle"), ...(carpeta === undefined ? {} : { carpeta }) },
      { onSuccess: (objeto) => navigate(`/objetos/${encodeURIComponent(objeto.id)}`) },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="font-heading text-display font-medium">{t("page.notas.title")}</h1>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            {t("page.notas.description")}
          </p>
        </div>
        <Button type="button" onClick={crearNota} disabled={crear.isPending}>
          <Plus aria-hidden="true" />
          {crear.isPending ? t("page.notas.creating") : t("page.notas.newNote")}
        </Button>
      </header>

      {crear.isError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
        >
          <span className="font-medium">{t("page.notas.createError")}. </span>
          {crear.error instanceof ApiError ? crear.error.mensaje : t("error.genericError")}
        </div>
      ) : null}

      {!lista.isError ? (
        <nav aria-label={t("page.notas.folderNav")} className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={carpeta === undefined ? "secondary" : "ghost"}
            aria-pressed={carpeta === undefined}
            onClick={() => setCarpeta(undefined)}
          >
            {t("page.notas.allFolders")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={carpeta === "" ? "secondary" : "ghost"}
            aria-pressed={carpeta === ""}
            onClick={() => setCarpeta("")}
          >
            {t("page.notas.rootFolder")}
          </Button>
          {carpetas.map((nombre) => (
            <Button
              key={nombre}
              type="button"
              size="sm"
              variant={carpeta === nombre ? "secondary" : "ghost"}
              aria-pressed={carpeta === nombre}
              onClick={() => setCarpeta(nombre)}
            >
              {nombre}
            </Button>
          ))}
        </nav>
      ) : null}

      {lista.isPending ? (
        <section
          aria-busy="true"
          className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet"
        >
          <p role="status" className="text-sm text-muted-foreground">
            {t("page.notas.loading")}
          </p>
        </section>
      ) : null}

      {lista.isError ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <h2 className="font-heading text-xl font-medium">{t("page.notas.loadError")}</h2>
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            {lista.error instanceof ApiError ? lista.error.mensaje : t("error.genericError")}
          </p>
          <Button variant="outline" className="mt-6" onClick={() => void lista.refetch()}>
            {t("page.notas.retry")}
          </Button>
        </section>
      ) : null}

      {lista.isSuccess && visibles.length === 0 ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <NotebookPen aria-hidden="true" className="size-6 text-primary" strokeWidth={1.5} />
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            {carpeta === undefined ? t("page.notas.empty") : t("page.notas.emptyFolder")}
          </p>
        </section>
      ) : null}

      {lista.isSuccess && visibles.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {visibles.map((objeto) => (
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
                    {objeto.degraded.length > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-sm border border-chart-4/40 bg-chart-4/10 px-1.5 py-0.5 font-medium text-foreground">
                        <FileWarning aria-hidden="true" className="size-3 text-chart-4" />
                        {t("page.notas.degraded")}
                      </span>
                    ) : null}
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
            {lista.isFetchingNextPage ? t("page.notas.loadingMore") : t("page.notas.loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
