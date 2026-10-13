import type { ObjectPayload, ObjetosPage } from "@migite/contracts";
import type { UseQueryResult } from "@tanstack/react-query";
import { FolderKanban, Plus, SquareArrowOutUpRight } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "@/api/api";
import { useGuardarAtributos, useObjeto, useObjetos } from "@/api/hooks";
import { MarkdownPreview } from "@/components/editor/markdown-preview";
import { AltaObjetoDialog } from "@/components/objetos/alta-objeto";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import type { AppTranslationKey } from "@/i18n/translate";
import { formatFecha } from "@/lib/fecha";
import { ESTADOS_PROYECTO, esEstadoProyecto } from "@/lib/proyectos";
import { tituloSeguroParaWikilink } from "@/lib/wikilinks";

const LIMITE_GRUPO = 50;

type Grupo = {
  readonly tipo: string;
  readonly labelKey: AppTranslationKey;
  readonly conEstado: boolean;
};

const GRUPOS = [
  { tipo: "nota", labelKey: "page.proyecto.groupNotas", conEstado: false },
  { tipo: "tarea", labelKey: "page.proyecto.groupTareas", conEstado: true },
  { tipo: "evento", labelKey: "page.proyecto.groupEventos", conEstado: false },
  { tipo: "recordatorio", labelKey: "page.proyecto.groupRecordatorios", conEstado: false },
] as const satisfies readonly Grupo[];

const enlacesInicialesDe = (titulo: string): readonly string[] =>
  tituloSeguroParaWikilink(titulo) ? [`[[${titulo}]]`] : [];

const estiloEstado = (estado: string): string => {
  switch (estado) {
    case "activo":
      return "border-primary/40 bg-primary/10 text-foreground";
    case "pausado":
      return "border-chart-4/40 bg-chart-4/10 text-foreground";
    case "archivado":
      return "border-dashed border-border bg-muted text-muted-foreground";
    default:
      return "border-border bg-muted text-foreground";
  }
};

type GrupoAsociadosProps = {
  readonly grupo: Grupo;
  readonly consulta: UseQueryResult<ObjetosPage, Error>;
  readonly onAgregar: () => void;
};

const GrupoAsociados = ({ grupo, consulta, onAgregar }: GrupoAsociadosProps) => {
  const { t, locale } = useI18n();
  const objetos = consulta.data?.objetos ?? [];

  return (
    <section
      aria-label={t(grupo.labelKey)}
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sheet"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-2.5">
        <h3 className="text-sm font-medium">{t(grupo.labelKey)}</h3>
        <div className="flex items-center gap-1">
          <span className="rounded-sm border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {objetos.length}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={t("page.proyecto.addInGroup", { grupo: t(grupo.labelKey) })}
            onClick={onAgregar}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </header>

      {consulta.isPending ? (
        <p role="status" className="px-4 py-3 text-sm text-muted-foreground">
          {t("page.proyecto.groupLoading")}
        </p>
      ) : null}

      {consulta.isError ? (
        <p role="alert" className="px-4 py-3 text-sm text-destructive">
          {t("page.proyecto.groupError")}
        </p>
      ) : null}

      {consulta.isSuccess && objetos.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{t("page.proyecto.groupEmpty")}</p>
      ) : null}

      {objetos.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border/60">
          {objetos.map((objeto) => {
            const estado =
              typeof objeto.atributos.estado === "string" ? objeto.atributos.estado : "";
            return (
              <li
                key={objeto.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5"
              >
                <Link
                  to={`/objetos/${encodeURIComponent(objeto.id)}`}
                  className="min-w-0 truncate text-sm font-medium transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {objeto.titulo}
                </Link>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {grupo.conEstado && estado !== "" ? (
                    <span
                      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-medium ${estiloEstado(estado)}`}
                    >
                      {estado}
                    </span>
                  ) : null}
                  <time dateTime={objeto.actualizado}>
                    {formatFecha(objeto.actualizado, locale, { dateStyle: "medium" })}
                  </time>
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
};

const ProyectoDetalle = ({ proyecto }: { readonly proyecto: ObjectPayload }) => {
  const { t, locale } = useI18n();
  const guardar = useGuardarAtributos(proyecto.id);
  const [altaTipo, setAltaTipo] = useState<string>();

  const estadoBruto = proyecto.atributos.estado;
  const estado = esEstadoProyecto(estadoBruto) ? estadoBruto : "";

  const notas = useObjetos({ tipo: "nota", enlazadoA: proyecto.id, limite: LIMITE_GRUPO });
  const tareas = useObjetos({ tipo: "tarea", enlazadoA: proyecto.id, limite: LIMITE_GRUPO });
  const eventos = useObjetos({ tipo: "evento", enlazadoA: proyecto.id, limite: LIMITE_GRUPO });
  const recordatorios = useObjetos({
    tipo: "recordatorio",
    enlazadoA: proyecto.id,
    limite: LIMITE_GRUPO,
  });
  const grupos = [
    { grupo: GRUPOS[0], consulta: notas },
    { grupo: GRUPOS[1], consulta: tareas },
    { grupo: GRUPOS[2], consulta: eventos },
    { grupo: GRUPOS[3], consulta: recordatorios },
  ];
  const totalAsociados = grupos.reduce(
    (total, { consulta }) => total + (consulta.data?.objetos.length ?? 0),
    0,
  );
  const todoCargado = grupos.every(({ consulta }) => consulta.isSuccess);

  const cambiarEstado = (nuevo: string) => {
    if (!esEstadoProyecto(nuevo) || nuevo === estado || guardar.isPending) {
      return;
    }
    guardar.mutate({ estado: nuevo });
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <h1 className="font-heading text-display font-medium break-words">{proyecto.titulo}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span
                className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-xs font-medium ${estiloEstado(estado)}`}
              >
                {estado === "" ? t("page.proyecto.unknownStatus") : estado}
              </span>
              <span aria-hidden="true" className="h-3 w-px bg-border" />
              <time dateTime={proyecto.actualizado}>
                {t("page.proyectos.updated", {
                  fecha: formatFecha(proyecto.actualizado, locale),
                })}
              </time>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={t("page.proyecto.statusLabel")}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
              value={estado}
              disabled={guardar.isPending}
              onChange={(evento) => cambiarEstado(evento.target.value)}
            >
              {estado === "" ? (
                <option value="" disabled>
                  {t("page.proyecto.unknownStatus")}
                </option>
              ) : null}
              {ESTADOS_PROYECTO.map((opcion) => (
                <option key={opcion} value={opcion}>
                  {opcion}
                </option>
              ))}
            </select>
            <Button asChild variant="outline">
              <Link to={`/objetos/${encodeURIComponent(proyecto.id)}`}>
                <SquareArrowOutUpRight aria-hidden="true" />
                {t("page.proyecto.editLink")}
              </Link>
            </Button>
          </div>
        </div>
        {guardar.isError ? (
          <p role="alert" className="text-sm text-destructive">
            <span className="font-medium">{t("page.proyecto.statusError")}. </span>
            {guardar.error instanceof ApiError ? guardar.error.mensaje : t("error.genericError")}
          </p>
        ) : null}
      </header>

      <section
        aria-label={t("page.proyecto.body")}
        className="rounded-lg border border-border bg-card px-5 py-4 shadow-sheet"
      >
        <h2 className="text-xs font-medium text-muted-foreground">{t("page.proyecto.body")}</h2>
        <div className="mt-2">
          <MarkdownPreview markdown={proyecto.cuerpo} emptyLabel={t("page.proyecto.emptyBody")} />
        </div>
      </section>

      <section aria-label={t("page.proyecto.associated")} className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-medium">{t("page.proyecto.associated")}</h2>
        {todoCargado && totalAsociados === 0 ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            {t("page.proyecto.associateHint", { nombre: proyecto.titulo })}
          </p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          {grupos.map(({ grupo, consulta }) => (
            <GrupoAsociados
              key={grupo.tipo}
              grupo={grupo}
              consulta={consulta}
              onAgregar={() => setAltaTipo(grupo.tipo)}
            />
          ))}
        </div>
      </section>

      {altaTipo === undefined ? null : (
        <AltaObjetoDialog
          tipoInicial={altaTipo}
          tipoFijo
          enlacesIniciales={enlacesInicialesDe(proyecto.titulo)}
          onCerrar={() => setAltaTipo(undefined)}
          onCreado={() => setAltaTipo(undefined)}
        />
      )}
    </div>
  );
};

export const ProyectoPage = () => {
  const { t } = useI18n();
  const { id } = useParams();
  const proyectoQuery = useObjeto(id);

  if (proyectoQuery.isPending) {
    return (
      <section
        aria-busy="true"
        className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet"
      >
        <h1 className="font-heading text-display font-medium">{t("page.proyecto.title")}</h1>
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {t("page.proyecto.loading")}
        </p>
      </section>
    );
  }

  const proyecto = proyectoQuery.data;

  if (proyectoQuery.error !== null || proyecto === undefined) {
    const error = proyectoQuery.error;
    const noEncontrado = error instanceof ApiError && error.status === 404;
    const mensaje = error instanceof ApiError ? error.mensaje : t("error.genericError");

    return (
      <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
        <FolderKanban aria-hidden="true" className="size-6 text-primary" strokeWidth={1.5} />
        <h1 className="mt-3 font-heading text-display font-medium">
          {noEncontrado ? t("page.proyecto.notFound") : t("page.proyecto.loadError")}
        </h1>
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">{mensaje}</p>
        <Button variant="outline" className="mt-6" onClick={() => void proyectoQuery.refetch()}>
          {t("page.proyecto.retry")}
        </Button>
      </section>
    );
  }

  return <ProyectoDetalle key={proyecto.id} proyecto={proyecto} />;
};
