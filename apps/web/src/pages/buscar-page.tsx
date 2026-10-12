import type { SearchResultItem } from "@migite/contracts";
import { ChevronRight, Search } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/api/api";
import { useBuscarInfinitos, useTipos } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/context";
import type { AppTranslationKey } from "@/i18n/translate";
import { agruparResultados, partirFragmento } from "@/lib/busqueda";
import { formatFecha } from "@/lib/fecha";

const LIMITE = 20;

const RETRASO_MS = 300;

const ESTILO_SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

const GRUPOS_NATIVOS: Readonly<Record<string, AppTranslationKey>> = {
  nota: "page.buscar.groupNota",
  tarea: "page.buscar.groupTarea",
  evento: "page.buscar.groupEvento",
  recordatorio: "page.buscar.groupRecordatorio",
  proyecto: "page.buscar.groupProyecto",
};

function useRetraso<T>(valor: T, retraso: number): T {
  const [retrasado, setRetrasado] = useState(valor);

  useEffect(() => {
    const id = setTimeout(() => setRetrasado(valor), retraso);
    return () => clearTimeout(id);
  }, [valor, retraso]);

  return retrasado;
}

const finDeDia = (fecha: string): string => `${fecha}T23:59:59.999Z`;

export const BuscarPage = () => {
  const { t, locale } = useI18n();
  const tipos = useTipos();
  const campoBusquedaId = useId();
  const campoTipoId = useId();
  const campoTagId = useId();
  const campoDesdeId = useId();
  const campoHastaId = useId();
  const [terminos, setTerminos] = useState("");
  const [tag, setTag] = useState("");
  const [tipo, setTipo] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [qInmediata, setQInmediata] = useState<string | undefined>(undefined);

  const qRetrasada = useRetraso(terminos.trim(), RETRASO_MS);
  const tagRetrasada = useRetraso(tag.trim(), RETRASO_MS);
  const q = qInmediata ?? qRetrasada;
  const activa = q !== "" || tipo !== "" || tagRetrasada !== "" || desde !== "" || hasta !== "";

  const lista = useBuscarInfinitos(
    {
      ...(q === "" ? {} : { q }),
      ...(tipo === "" ? {} : { tipo }),
      ...(tagRetrasada === "" ? {} : { tag: tagRetrasada }),
      ...(desde === "" ? {} : { desde }),
      ...(hasta === "" ? {} : { hasta: finDeDia(hasta) }),
      limite: LIMITE,
    },
    activa,
  );

  const resultados = useMemo(() => {
    const vistos = new Set<string>();
    const items: SearchResultItem[] = [];
    for (const pagina of lista.data?.pages ?? []) {
      for (const resultado of pagina.resultados) {
        if (vistos.has(resultado.id)) {
          continue;
        }
        vistos.add(resultado.id);
        items.push(resultado);
      }
    }
    return items;
  }, [lista.data]);

  const grupos = useMemo(() => agruparResultados(resultados), [resultados]);

  const nombreGrupo = (id: string): string => {
    const clave = GRUPOS_NATIVOS[id];
    if (clave !== undefined) {
      return t(clave);
    }
    return tipos.data?.find((item) => item.id === id)?.nombre ?? id;
  };

  const limpiar = () => {
    setTerminos("");
    setTag("");
    setTipo("");
    setDesde("");
    setHasta("");
    setQInmediata("");
  };

  const formularioVacio =
    terminos === "" && tag === "" && tipo === "" && desde === "" && hasta === "";

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b border-border pb-5">
        <h1 className="font-heading text-display font-medium text-foreground">
          {t("page.buscar.title")}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {t("page.buscar.description")}
        </p>
      </header>

      <search aria-label={t("page.buscar.searchLabel")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(evento) => {
            evento.preventDefault();
            setQInmediata(terminos.trim());
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={campoBusquedaId} className="sr-only">
              {t("page.buscar.searchLabel")}
            </label>
            <Input
              id={campoBusquedaId}
              type="search"
              value={terminos}
              placeholder={t("page.buscar.searchPlaceholder")}
              className="min-w-0 flex-1"
              onChange={(evento) => {
                setTerminos(evento.target.value);
                setQInmediata(undefined);
              }}
            />
            <Button type="submit">
              <Search aria-hidden="true" />
              {t("page.buscar.submit")}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={campoTipoId} className="text-xs font-medium text-muted-foreground">
                {t("page.buscar.typeLabel")}
              </label>
              <select
                id={campoTipoId}
                className={ESTILO_SELECT}
                value={tipo}
                onChange={(evento) => setTipo(evento.target.value)}
              >
                <option value="">{t("page.buscar.typeAll")}</option>
                {(tipos.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={campoTagId} className="text-xs font-medium text-muted-foreground">
                {t("page.buscar.tagLabel")}
              </label>
              <Input
                id={campoTagId}
                value={tag}
                placeholder={t("page.buscar.tagPlaceholder")}
                onChange={(evento) => setTag(evento.target.value)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={campoDesdeId} className="text-xs font-medium text-muted-foreground">
                {t("page.buscar.fromLabel")}
              </label>
              <Input
                id={campoDesdeId}
                type="date"
                value={desde}
                onChange={(evento) => setDesde(evento.target.value)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={campoHastaId} className="text-xs font-medium text-muted-foreground">
                {t("page.buscar.untilLabel")}
              </label>
              <Input
                id={campoHastaId}
                type="date"
                value={hasta}
                onChange={(evento) => setHasta(evento.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={limpiar}
              disabled={formularioVacio}
            >
              {t("page.buscar.clear")}
            </Button>
          </div>
        </form>
      </search>

      {!activa ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <Search aria-hidden="true" className="size-6 text-primary" strokeWidth={1.5} />
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">{t("page.buscar.empty")}</p>
        </section>
      ) : null}

      {activa && lista.isPending ? (
        <section
          aria-busy="true"
          className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet"
        >
          <p role="status" className="text-sm text-muted-foreground">
            {t("page.buscar.loading")}
          </p>
        </section>
      ) : null}

      {activa && lista.isError ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <h2 className="font-heading text-xl font-medium">{t("page.buscar.loadError")}</h2>
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            {lista.error instanceof ApiError ? lista.error.mensaje : t("error.genericError")}
          </p>
          <Button variant="outline" className="mt-6" onClick={() => void lista.refetch()}>
            {t("page.buscar.retry")}
          </Button>
        </section>
      ) : null}

      {activa && lista.isSuccess && resultados.length === 0 ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <Search aria-hidden="true" className="size-6 text-primary" strokeWidth={1.5} />
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            {t("page.buscar.noResults")}
          </p>
        </section>
      ) : null}

      {activa && resultados.length > 0 ? (
        <div className="flex flex-col gap-6">
          {grupos.map((grupo) => (
            <section key={grupo.tipo} className="flex flex-col gap-3">
              <h2 className="font-heading text-xl font-medium">
                {t("page.buscar.groupHeading", {
                  nombre: nombreGrupo(grupo.tipo),
                  total: grupo.resultados.length,
                })}
              </h2>
              <ul className="flex flex-col gap-3">
                {grupo.resultados.map((resultado) => (
                  <li
                    key={resultado.id}
                    className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3.5 shadow-sheet transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <div className="min-w-0">
                      <Link
                        to={`/objetos/${encodeURIComponent(resultado.id)}`}
                        className="group rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <h3 className="truncate font-heading text-lg font-medium group-hover:text-primary">
                          {resultado.titulo}
                        </h3>
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <time dateTime={resultado.actualizado}>
                          {formatFecha(resultado.actualizado, locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </time>
                      </p>
                      {resultado.fragmento === undefined ? null : (
                        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
                          {partirFragmento(resultado.fragmento, q).map((parte) =>
                            parte.coincide ? (
                              <mark
                                key={parte.inicio}
                                className="rounded-sm bg-primary/20 px-0.5 font-medium text-foreground"
                              >
                                {parte.texto}
                              </mark>
                            ) : (
                              <span key={parte.inicio}>{parte.texto}</span>
                            ),
                          )}
                        </p>
                      )}
                    </div>
                    <ChevronRight
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 text-muted-foreground"
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}

      {activa && lista.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => void lista.fetchNextPage()}
            disabled={lista.isFetchingNextPage}
          >
            {lista.isFetchingNextPage ? t("page.buscar.loadingMore") : t("page.buscar.loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
