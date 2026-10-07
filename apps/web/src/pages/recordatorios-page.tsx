import type { ObjectPayload } from "@migite/contracts";
import { AlarmClock, Plus, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/api/api";
import { type ObjetosListaParams, useCrearObjeto, useObjetosInfinitos } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/context";
import type { AppTranslationKey } from "@/i18n/translate";
import { formatFecha } from "@/lib/fecha";
import {
  compararPorHora,
  ESTADO_PENDIENTE,
  ESTADO_VENCIDO,
  type EstadoRecordatorio,
  estadoDeRecordatorio,
  horaEnMs,
} from "@/lib/recordatorios";

const LIMITE = 20;

type Vista = "proximos" | "vencidos" | "todos";

const VISTAS = ["proximos", "vencidos", "todos"] as const satisfies readonly Vista[];

const VISTA_KEYS = {
  proximos: "page.recordatorios.viewUpcoming",
  vencidos: "page.recordatorios.viewOverdue",
  todos: "page.recordatorios.viewAll",
} as const satisfies Record<Vista, AppTranslationKey>;

const VISTA_EMPTY_KEYS = {
  proximos: "page.recordatorios.emptyUpcoming",
  vencidos: "page.recordatorios.emptyOverdue",
  todos: "page.recordatorios.emptyAll",
} as const satisfies Record<Vista, AppTranslationKey>;

const ESTADO_KEYS = {
  pendiente: "page.recordatorios.statusPending",
  vencido: "page.recordatorios.statusOverdue",
} as const satisfies Record<EstadoRecordatorio, AppTranslationKey>;

const paramsDeVista = (vista: Vista, ahora: Date): ObjetosListaParams => {
  const base = { tipo: "recordatorio", limite: LIMITE };
  const ahoraIso = ahora.toISOString();
  switch (vista) {
    case "proximos":
      return { ...base, rangoAtributo: [{ clave: "hora", desde: ahoraIso }] };
    case "vencidos":
      return { ...base, rangoAtributo: [{ clave: "hora", hasta: ahoraIso }] };
    case "todos":
      return base;
  }
};

const estiloEstado = (estado: EstadoRecordatorio): string =>
  estado === ESTADO_VENCIDO
    ? "border-destructive/40 bg-destructive/10 text-destructive"
    : "border-border bg-muted text-foreground";

type FilaRecordatorioProps = {
  readonly recordatorio: ObjectPayload;
  readonly ahora: Date;
};

const FilaRecordatorio = ({ recordatorio, ahora }: FilaRecordatorioProps) => {
  const { locale, t } = useI18n();
  const hora = recordatorio.atributos.hora;
  const horaMs = horaEnMs(hora);
  const estado = estadoDeRecordatorio(hora, ahora);

  return (
    <li>
      <article className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border border-border bg-card px-4 py-3.5 shadow-sheet">
        <div className="min-w-0">
          <h2 className="truncate font-heading text-lg font-medium">
            <Link
              to={`/objetos/${encodeURIComponent(recordatorio.id)}`}
              className="rounded-sm transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {recordatorio.titulo}
            </Link>
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {horaMs === undefined ? (
              <span>{t("page.recordatorios.noTime")}</span>
            ) : (
              <time dateTime={String(hora)}>{formatFecha(String(hora), locale)}</time>
            )}
            <span aria-hidden="true" className="h-3 w-px bg-border" />
            <span
              className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-medium ${estiloEstado(estado)}`}
            >
              {t(ESTADO_KEYS[estado])}
            </span>
            {estado === ESTADO_VENCIDO ? (
              <span className="inline-flex items-center gap-1 rounded-sm border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive">
                <TriangleAlert aria-hidden="true" className="size-3" />
                {t("page.recordatorios.overdueBadge")}
              </span>
            ) : null}
          </p>
        </div>
      </article>
    </li>
  );
};

export const RecordatoriosPage = () => {
  const { t } = useI18n();
  const [vista, setVista] = useState<Vista>("proximos");
  const [ahora, setAhora] = useState(() => new Date());
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [hora, setHora] = useState("");
  const crear = useCrearObjeto();

  const lista = useObjetosInfinitos(paramsDeVista(vista, ahora));

  const recordatorios = useMemo(() => {
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
    if (vista === "proximos") {
      resultado.sort((a, b) => compararPorHora(a.atributos, b.atributos));
    }
    return resultado;
  }, [lista.data, vista]);

  const cambiarVista = (siguiente: Vista) => {
    setVista(siguiente);
    setAhora(new Date());
  };

  const abrirNuevo = () => {
    crear.reset();
    setNuevoAbierto(true);
  };

  const crearRecordatorio = () => {
    const limpio = titulo.trim();
    const horaMs = horaEnMs(hora);
    if (limpio === "" || horaMs === undefined || crear.isPending) {
      return;
    }
    crear.mutate(
      {
        tipo: "recordatorio",
        titulo: limpio,
        atributos: { hora: new Date(horaMs).toISOString(), estado: ESTADO_PENDIENTE },
      },
      {
        onSuccess: () => {
          setNuevoAbierto(false);
          setTitulo("");
          setHora("");
          crear.reset();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="font-heading text-display font-medium">{t("page.recordatorios.title")}</h1>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            {t("page.recordatorios.description")}
          </p>
        </div>
        <Button type="button" onClick={abrirNuevo}>
          <Plus aria-hidden="true" />
          {t("page.recordatorios.newReminder")}
        </Button>
      </header>

      {!lista.isError ? (
        <nav
          aria-label={t("page.recordatorios.viewNav")}
          className="flex flex-wrap items-center gap-1.5"
        >
          {VISTAS.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={vista === item ? "secondary" : "ghost"}
              aria-pressed={vista === item}
              onClick={() => cambiarVista(item)}
            >
              {t(VISTA_KEYS[item])}
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
            {t("page.recordatorios.loading")}
          </p>
        </section>
      ) : null}

      {lista.isError ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <h2 className="font-heading text-xl font-medium">{t("page.recordatorios.loadError")}</h2>
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            {lista.error instanceof ApiError ? lista.error.mensaje : t("error.genericError")}
          </p>
          <Button variant="outline" className="mt-6" onClick={() => void lista.refetch()}>
            {t("page.recordatorios.retry")}
          </Button>
        </section>
      ) : null}

      {lista.isSuccess && recordatorios.length === 0 ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <AlarmClock aria-hidden="true" className="size-6 text-primary" strokeWidth={1.5} />
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            {t(VISTA_EMPTY_KEYS[vista])}
          </p>
        </section>
      ) : null}

      {lista.isSuccess && recordatorios.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {recordatorios.map((recordatorio) => (
            <FilaRecordatorio key={recordatorio.id} recordatorio={recordatorio} ahora={ahora} />
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
              ? t("page.recordatorios.loadingMore")
              : t("page.recordatorios.loadMore")}
          </Button>
        </div>
      ) : null}

      <Dialog open={nuevoAbierto} onOpenChange={setNuevoAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("page.recordatorios.newReminderTitle")}</DialogTitle>
            <DialogDescription>{t("page.recordatorios.newReminderDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(evento) => {
              evento.preventDefault();
              crearRecordatorio();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="recordatorio-titulo"
                className="text-xs font-medium text-muted-foreground"
              >
                {t("page.recordatorios.titleLabel")}
              </label>
              <Input
                id="recordatorio-titulo"
                value={titulo}
                onChange={(evento) => setTitulo(evento.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="recordatorio-hora"
                className="text-xs font-medium text-muted-foreground"
              >
                {t("page.recordatorios.hourLabel")}
              </label>
              <Input
                id="recordatorio-hora"
                type="datetime-local"
                required
                value={hora}
                onChange={(evento) => setHora(evento.target.value)}
              />
            </div>
            {crear.isError ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
              >
                <span className="font-medium">{t("page.recordatorios.createError")}. </span>
                {crear.error instanceof ApiError ? crear.error.mensaje : t("error.genericError")}
              </div>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={crear.isPending}>
                  {t("page.recordatorios.createCancel")}
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={titulo.trim() === "" || hora === "" || crear.isPending}
              >
                {crear.isPending
                  ? t("page.recordatorios.creating")
                  : t("page.recordatorios.createSubmit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
