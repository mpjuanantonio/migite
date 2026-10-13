import type { ObjectPayload } from "@migite/contracts";
import {
  ChevronRight,
  FileWarning,
  Folder,
  ListFilter,
  NotebookPen,
  Plus,
  Shapes,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "@/api/api";
import { useObjetosInfinitos } from "@/api/hooks";
import { DisposicionExplorador } from "@/components/explorador/disposicion-explorador";
import { AltaObjetoDialog } from "@/components/objetos/alta-objeto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/context";
import { formatFecha } from "@/lib/fecha";

const LIMITE = 20;

const MAX_TAGS_FILA = 3;

const ATRIBUTO_ETIQUETAS = "etiquetas";

const etiquetasDe = (objeto: ObjectPayload): readonly string[] => {
  const valor = objeto.atributos[ATRIBUTO_ETIQUETAS];
  if (!Array.isArray(valor)) {
    return [];
  }
  return [
    ...new Set(valor.filter((item): item is string => typeof item === "string" && item !== "")),
  ];
};

const leerCarpetaInicial = (estado: unknown): string | undefined => {
  if (typeof estado !== "object" || estado === null) {
    return undefined;
  }
  const carpeta = (estado as { readonly carpeta?: unknown }).carpeta;
  return typeof carpeta === "string" ? carpeta : undefined;
};

export const NotasPage = () => {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const campoTagId = useId();
  const sugerenciasTagId = useId();
  const [carpeta, setCarpeta] = useState<string | undefined>(() =>
    leerCarpetaInicial(location.state),
  );
  const [tag, setTag] = useState("");
  const [tagBorrador, setTagBorrador] = useState("");
  const [carpetas, setCarpetas] = useState<readonly string[]>([]);
  const [tags, setTags] = useState<readonly string[]>([]);
  const [alta, setAlta] = useState<{ readonly tipo?: string }>();

  const tagActivo = tag.trim();

  const lista = useObjetosInfinitos({
    limite: LIMITE,
    ...(carpeta === undefined ? {} : { carpeta }),
    ...(tagActivo === "" ? {} : { tag: tagActivo }),
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

  useEffect(() => {
    setTags((previos) => {
      const conjunto = new Set(previos);
      for (const objeto of objetos) {
        for (const etiqueta of etiquetasDe(objeto)) {
          conjunto.add(etiqueta);
        }
      }
      if (conjunto.size === previos.length) {
        return previos;
      }
      return [...conjunto].sort((a, b) => a.localeCompare(b, locale));
    });
  }, [objetos, locale]);

  const visibles = useMemo(
    () => (carpeta === "" ? objetos.filter((objeto) => objeto.carpeta === "") : objetos),
    [carpeta, objetos],
  );

  const aplicarTag = (valor: string) => {
    const limpio = valor.trim();
    setTag(limpio);
    setTagBorrador(limpio);
  };

  const quitarTag = () => {
    setTag("");
    setTagBorrador("");
  };

  const abrirAlta = (tipo?: string) => {
    setAlta(tipo === undefined ? {} : { tipo });
  };

  return (
    <DisposicionExplorador
      {...(carpeta === undefined ? {} : { carpetaSeleccionada: carpeta })}
      onSeleccionarCarpeta={setCarpeta}
    >
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-b border-border pb-5">
          <div className="min-w-0">
            <h1 className="font-heading text-display font-medium">{t("page.notas.title")}</h1>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">
              {t("page.notas.description")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => abrirAlta()}>
              <Plus aria-hidden="true" />
              {t("page.notas.newObject")}
            </Button>
            <Button type="button" variant="outline" onClick={() => abrirAlta("nota")}>
              <NotebookPen aria-hidden="true" />
              {t("page.notas.newNote")}
            </Button>
          </div>
        </header>

        {alta !== undefined ? (
          <AltaObjetoDialog
            {...(alta.tipo === undefined ? {} : { tipoInicial: alta.tipo })}
            {...(carpeta === undefined ? {} : { carpetaInicial: carpeta })}
            carpetasConocidas={carpetas}
            onCerrar={() => setAlta(undefined)}
            onCreado={(id) => navigate(`/objetos/${encodeURIComponent(id)}`)}
          />
        ) : null}

        {!lista.isError ? (
          <search
            aria-label={t("page.notas.tagFilterNav")}
            className="flex flex-wrap items-end gap-x-4 gap-y-2"
          >
            <form
              className="flex items-end gap-2"
              onSubmit={(evento) => {
                evento.preventDefault();
                aplicarTag(tagBorrador);
              }}
            >
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor={campoTagId} className="text-xs font-medium text-muted-foreground">
                  {t("page.notas.tagLabel")}
                </label>
                <Input
                  id={campoTagId}
                  list={sugerenciasTagId}
                  className="h-8 w-48"
                  value={tagBorrador}
                  placeholder={t("page.notas.tagPlaceholder")}
                  onChange={(evento) => setTagBorrador(evento.target.value)}
                />
              </div>
              <Button type="submit" variant="outline" size="sm">
                <ListFilter aria-hidden="true" />
                {t("page.notas.tagApply")}
              </Button>
              <datalist id={sugerenciasTagId}>
                {tags.map((etiqueta) => (
                  <option key={etiqueta} value={etiqueta} />
                ))}
              </datalist>
            </form>
            {tagActivo === "" ? null : (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 text-xs font-medium text-foreground">
                {tagActivo}
                <button
                  type="button"
                  aria-label={t("page.notas.tagRemove", { tag: tagActivo })}
                  className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={quitarTag}
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </span>
            )}
          </search>
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
            <Shapes aria-hidden="true" className="size-6 text-primary" strokeWidth={1.5} />
            <p className="mt-3 max-w-prose text-sm text-muted-foreground">
              {tagActivo !== ""
                ? t("page.notas.emptyTag")
                : carpeta === undefined
                  ? t("page.notas.empty")
                  : t("page.notas.emptyFolder")}
            </p>
            {tagActivo === "" && carpeta === undefined ? (
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                {t("page.notas.emptyHint")}
              </p>
            ) : null}
          </section>
        ) : null}

        {lista.isSuccess && visibles.length > 0 ? (
          <ul aria-label={t("page.notas.listLabel")} className="flex flex-col gap-3">
            {visibles.map((objeto) => {
              const etiquetas = etiquetasDe(objeto);
              return (
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
                          <Folder
                            aria-hidden="true"
                            className="size-3 shrink-0"
                            strokeWidth={1.75}
                          />
                          <span className="truncate">
                            {objeto.carpeta === "" ? t("page.notas.noFolder") : objeto.carpeta}
                          </span>
                        </span>
                        {etiquetas.length > 0 ? (
                          <span aria-hidden="true" className="h-3 w-px bg-border" />
                        ) : null}
                        {etiquetas.slice(0, MAX_TAGS_FILA).map((etiqueta) => (
                          <button
                            key={etiqueta}
                            type="button"
                            className="rounded-full border border-border bg-background px-2 py-0.5 font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            onClick={(evento) => {
                              evento.preventDefault();
                              aplicarTag(etiqueta);
                            }}
                          >
                            {etiqueta}
                          </button>
                        ))}
                        {etiquetas.length > MAX_TAGS_FILA ? (
                          <span className="rounded-full border border-dashed border-border px-2 py-0.5 font-medium">
                            {t("page.notas.moreTags", {
                              total: etiquetas.length - MAX_TAGS_FILA,
                            })}
                          </span>
                        ) : null}
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
              );
            })}
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
    </DisposicionExplorador>
  );
};
