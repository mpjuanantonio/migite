import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/api/api";
import { useCrearObjeto, useObjetos } from "@/api/hooks";
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
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/context";
import {
  claveDia,
  compararEventos,
  construirMes,
  diasDeLaSemana,
  type EventoCalendario,
  etiquetaMes,
  eventosDelDia,
  finDeMes,
  formatearDia,
  formatearHora,
  HOLGURA_DIAS,
  inicioDeMes,
  interpretarEvento,
  solapa,
  sumarDias,
} from "@/lib/calendario";
import { cn } from "@/lib/utils";

const LIMITE = 500;

type Borrador = {
  readonly titulo: string;
  readonly todoElDia: boolean;
  readonly inicio: string;
  readonly fin: string;
  readonly notas: string;
};

const borradorInicial = (dia: Date): Borrador => ({
  titulo: "",
  todoElDia: false,
  inicio: `${claveDia(dia)}T09:00`,
  fin: "",
  notas: "",
});

const msDeValor = (valor: string, todoElDia: boolean, esFin: boolean): number | undefined => {
  if (valor.trim() === "") {
    return undefined;
  }
  const texto = todoElDia ? `${valor}T${esFin ? "23:59:59.999" : "00:00:00"}` : valor;
  const ms = new Date(texto).getTime();
  return Number.isNaN(ms) ? undefined : ms;
};

type ChipEventoProps = {
  readonly evento: EventoCalendario;
  readonly locale: string;
  readonly etiquetaTodoElDia: string;
};

const ChipEvento = ({ evento, locale, etiquetaTodoElDia }: ChipEventoProps) => (
  <li>
    <Link
      to={`/objetos/${encodeURIComponent(evento.objeto.id)}`}
      data-todo-el-dia={evento.todoElDia ? "true" : undefined}
      className={cn(
        "flex items-start gap-1.5 rounded-sm border px-1.5 py-1 text-xs leading-snug transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        evento.todoElDia
          ? "border-primary/40 bg-primary/10 hover:bg-primary/15"
          : "border-border bg-background hover:border-primary/40",
      )}
    >
      {evento.todoElDia ? (
        <span className="sr-only">{etiquetaTodoElDia}</span>
      ) : (
        <time
          dateTime={evento.inicio.toISOString()}
          className="shrink-0 font-medium tabular-nums text-muted-foreground"
        >
          {formatearHora(evento.inicio, locale)}
        </time>
      )}
      <span className="truncate font-medium text-foreground">{evento.objeto.titulo}</span>
    </Link>
  </li>
);

export const CalendarioPage = () => {
  const { locale, t } = useI18n();
  const [mes, setMes] = useState(() => inicioDeMes(new Date()));
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [borrador, setBorrador] = useState<Borrador>(() => borradorInicial(new Date()));
  const crear = useCrearObjeto();

  const params = useMemo(() => {
    // El API filtra por `rango.inicio.desde`, así que ampliamos el rango 31 días hacia atrás
    // para recuperar eventos que empiezan antes del mes y terminan dentro; el solape real se
    // comprueba en cliente sobre las celdas del mes.
    const desde = sumarDias(inicioDeMes(mes), -HOLGURA_DIAS);
    return {
      tipo: "evento",
      limite: LIMITE,
      rangoAtributo: [
        { clave: "inicio", desde: desde.toISOString(), hasta: finDeMes(mes).toISOString() },
      ],
    };
  }, [mes]);

  const lista = useObjetos(params);

  const eventos = useMemo(() => {
    const desde = inicioDeMes(mes);
    const hasta = finDeMes(mes);
    return (lista.data?.objetos ?? [])
      .map(interpretarEvento)
      .filter(
        (evento): evento is EventoCalendario =>
          evento !== undefined && solapa(evento, desde, hasta),
      );
  }, [lista.data, mes]);

  const semanas = useMemo(() => {
    const celdas = construirMes(mes);
    return Array.from({ length: celdas.length / 7 }, (_, indice) =>
      celdas.slice(indice * 7, indice * 7 + 7),
    );
  }, [mes]);

  const inicioMs = msDeValor(borrador.inicio, borrador.todoElDia, false);
  const finMs = msDeValor(borrador.fin, borrador.todoElDia, true);
  const rangoInvalido = inicioMs !== undefined && finMs !== undefined && finMs < inicioMs;
  const puedeCrear =
    borrador.titulo.trim() !== "" && inicioMs !== undefined && !rangoInvalido && !crear.isPending;

  const abrirNuevo = (dia: Date) => {
    crear.reset();
    setBorrador(borradorInicial(dia));
    setDialogoAbierto(true);
  };

  const alternarTodoElDia = (valor: boolean) => {
    setBorrador((previo) => ({
      ...previo,
      todoElDia: valor,
      inicio: valor ? previo.inicio.slice(0, 10) : `${previo.inicio.slice(0, 10)}T09:00`,
      fin:
        previo.fin === ""
          ? ""
          : valor
            ? previo.fin.slice(0, 10)
            : `${previo.fin.slice(0, 10)}T10:00`,
    }));
  };

  const crearEvento = () => {
    const titulo = borrador.titulo.trim();
    if (titulo === "" || inicioMs === undefined || rangoInvalido || crear.isPending) {
      return;
    }
    const atributos: Record<string, unknown> = {
      inicio: new Date(inicioMs).toISOString(),
      todoElDia: borrador.todoElDia,
    };
    if (finMs !== undefined) {
      atributos.fin = new Date(finMs).toISOString();
    }
    const notas = borrador.notas.trim();
    crear.mutate(
      {
        tipo: "evento",
        titulo,
        atributos,
        ...(notas === "" ? {} : { cuerpo: notas }),
      },
      {
        onSuccess: () => {
          setDialogoAbierto(false);
          crear.reset();
        },
      },
    );
  };

  const etiqueta = etiquetaMes(mes, locale);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="font-heading text-display font-medium">{t("page.calendario.title")}</h1>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            {t("page.calendario.description")}
          </p>
        </div>
        <Button type="button" onClick={() => abrirNuevo(new Date())}>
          <Plus aria-hidden="true" />
          {t("page.calendario.newEvent")}
        </Button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 aria-live="polite" className="font-heading text-xl font-medium">
          {etiqueta}
        </h2>
        <nav aria-label={t("page.calendario.periodNav")} className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t("page.calendario.previousMonth")}
            onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" onClick={() => setMes(inicioDeMes(new Date()))}>
            {t("page.calendario.today")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t("page.calendario.nextMonth")}
            onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      </div>

      {lista.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("page.calendario.loading")}
        </p>
      ) : null}

      {lista.isError ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <h2 className="font-heading text-xl font-medium">{t("page.calendario.loadError")}</h2>
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            {lista.error instanceof ApiError ? lista.error.mensaje : t("error.genericError")}
          </p>
          <Button variant="outline" className="mt-6" onClick={() => void lista.refetch()}>
            {t("page.calendario.retry")}
          </Button>
        </section>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sheet">
          <table
            aria-label={t("page.calendario.gridLabel", { mes: etiqueta })}
            className="w-full min-w-[44rem] border-collapse"
          >
            <thead>
              <tr>
                {diasDeLaSemana(locale).map((dia) => (
                  <th
                    key={dia}
                    scope="col"
                    className="border-b border-border px-2 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                  >
                    {dia}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semanas.map((semana, indice) => (
                <tr key={semana[0]?.clave ?? String(indice)}>
                  {semana.map((celda) => {
                    const delDia = celda.fueraDeMes
                      ? []
                      : [...eventosDelDia(eventos, celda.fecha)].sort(compararEventos);
                    return (
                      <td
                        key={celda.clave}
                        data-dia={celda.clave}
                        className={cn(
                          "border-b border-l border-border align-top first:border-l-0",
                          celda.fueraDeMes ? "bg-muted/40" : "bg-card",
                        )}
                      >
                        <div className="flex min-h-28 flex-col gap-1 p-1.5">
                          <button
                            type="button"
                            onClick={() => abrirNuevo(celda.fecha)}
                            aria-label={t("page.calendario.addOnDay", {
                              fecha: formatearDia(celda.fecha, locale),
                            })}
                            className={cn(
                              "flex size-7 items-center justify-center rounded-full font-heading text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                              celda.esHoy
                                ? "bg-primary font-semibold text-primary-foreground"
                                : "hover:bg-accent",
                              celda.fueraDeMes && !celda.esHoy ? "text-muted-foreground/60" : "",
                            )}
                          >
                            {celda.fecha.getDate()}
                          </button>
                          {delDia.length > 0 ? (
                            <ul className="flex flex-col gap-1">
                              {delDia.map((evento) => (
                                <ChipEvento
                                  key={evento.objeto.id}
                                  evento={evento}
                                  locale={locale}
                                  etiquetaTodoElDia={t("page.calendario.allDay")}
                                />
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("page.calendario.newEventTitle")}</DialogTitle>
            <DialogDescription>{t("page.calendario.newEventDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(evento) => {
              evento.preventDefault();
              crearEvento();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="evento-titulo" className="text-xs font-medium text-muted-foreground">
                {t("page.calendario.titleLabel")}
              </label>
              <Input
                id="evento-titulo"
                required
                value={borrador.titulo}
                onChange={(evento) =>
                  setBorrador((previo) => ({ ...previo, titulo: evento.target.value }))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label
                htmlFor="evento-todo-el-dia"
                className="text-xs font-medium text-muted-foreground"
              >
                {t("page.calendario.allDay")}
              </label>
              <Switch
                id="evento-todo-el-dia"
                aria-label={t("page.calendario.allDay")}
                checked={borrador.todoElDia}
                onCheckedChange={alternarTodoElDia}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="evento-inicio"
                  className="text-xs font-medium text-muted-foreground"
                >
                  {t("page.calendario.startLabel")}
                </label>
                <Input
                  id="evento-inicio"
                  type={borrador.todoElDia ? "date" : "datetime-local"}
                  required
                  value={borrador.inicio}
                  onChange={(evento) =>
                    setBorrador((previo) => ({ ...previo, inicio: evento.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="evento-fin" className="text-xs font-medium text-muted-foreground">
                  {t("page.calendario.endLabel")}
                </label>
                <Input
                  id="evento-fin"
                  type={borrador.todoElDia ? "date" : "datetime-local"}
                  value={borrador.fin}
                  aria-invalid={rangoInvalido || undefined}
                  onChange={(evento) =>
                    setBorrador((previo) => ({ ...previo, fin: evento.target.value }))
                  }
                />
              </div>
            </div>
            {rangoInvalido ? (
              <p role="alert" className="text-sm text-destructive">
                {t("page.calendario.invalidRange")}
              </p>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="evento-notas" className="text-xs font-medium text-muted-foreground">
                {t("page.calendario.notesLabel")}
              </label>
              <textarea
                id="evento-notas"
                rows={3}
                value={borrador.notas}
                onChange={(evento) =>
                  setBorrador((previo) => ({ ...previo, notas: evento.target.value }))
                }
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
              />
            </div>
            {crear.isError ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
              >
                <span className="font-medium">{t("page.calendario.createError")}. </span>
                {crear.error instanceof ApiError ? crear.error.mensaje : t("error.genericError")}
              </div>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={crear.isPending}>
                  {t("page.calendario.createCancel")}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!puedeCrear}>
                {crear.isPending
                  ? t("page.calendario.creating")
                  : t("page.calendario.createSubmit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
