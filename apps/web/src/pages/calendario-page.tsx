import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { ApiError } from "@/api/api";
import { useCrearObjeto, useMoverEvento, useObjetos } from "@/api/hooks";
import { ChipEvento } from "@/components/calendario/chip-evento";
import { type ArrastreCalendario, VistaPeriodo } from "@/components/calendario/vista-periodo";
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
  claveDestinoDia,
  claveDia,
  claveHora,
  compararEventos,
  construirDia,
  construirMes,
  construirSemana,
  type DestinoEvento,
  diasDeLaSemana,
  type EventoCalendario,
  etiquetaDia,
  etiquetaMes,
  etiquetaSemana,
  eventosDelDia,
  finDelDia,
  finDeMes,
  finDeSemana,
  formatearDia,
  HOLGURA_DIAS,
  inicioDelDia,
  inicioDeMes,
  inicioDeSemana,
  interpretarEvento,
  type MovimientoEvento,
  moverEventoADia,
  moverEventoAHora,
  solapa,
  sumarDias,
} from "@/lib/calendario";
import { cn } from "@/lib/utils";

const LIMITE = 500;
const CLAVE_VISTA = "migite.calendario.vista";

type Vista = "mes" | "semana" | "dia";

const VISTAS: readonly Vista[] = ["mes", "semana", "dia"];

const VISTA_KEYS = {
  mes: "page.calendario.viewMonth",
  semana: "page.calendario.viewWeek",
  dia: "page.calendario.viewDay",
} as const;

const NAV_KEYS = {
  mes: { anterior: "page.calendario.previousMonth", siguiente: "page.calendario.nextMonth" },
  semana: { anterior: "page.calendario.previousWeek", siguiente: "page.calendario.nextWeek" },
  dia: { anterior: "page.calendario.previousDay", siguiente: "page.calendario.nextDay" },
} as const;

const esVista = (valor: string | null): valor is Vista =>
  valor === "mes" || valor === "semana" || valor === "dia";

const leerVista = (): Vista => {
  try {
    const guardada = localStorage.getItem(CLAVE_VISTA);
    return esVista(guardada) ? guardada : "mes";
  } catch {
    return "mes";
  }
};

const guardarVista = (vista: Vista): void => {
  try {
    localStorage.setItem(CLAVE_VISTA, vista);
  } catch {
    return;
  }
};

type Borrador = {
  readonly titulo: string;
  readonly todoElDia: boolean;
  readonly inicio: string;
  readonly fin: string;
  readonly notas: string;
};

const borradorInicial = (dia: Date, hora = 9): Borrador => ({
  titulo: "",
  todoElDia: false,
  inicio: `${claveDia(dia)}T${claveHora(hora)}`,
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

export const CalendarioPage = () => {
  const { locale, t } = useI18n();
  const [vista, setVista] = useState<Vista>(leerVista);
  const [cursor, setCursor] = useState(() => new Date());
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [borrador, setBorrador] = useState<Borrador>(() => borradorInicial(new Date()));
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null);
  const [destinoActivo, setDestinoActivo] = useState<string | null>(null);
  const [cambios, setCambios] = useState<Record<string, MovimientoEvento>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const crear = useCrearObjeto();
  const moverEvento = useMoverEvento();

  const periodo = useMemo(() => {
    if (vista === "semana") {
      return { desde: inicioDeSemana(cursor), hasta: finDeSemana(cursor) };
    }
    if (vista === "dia") {
      return { desde: inicioDelDia(cursor), hasta: finDelDia(cursor) };
    }
    return { desde: inicioDeMes(cursor), hasta: finDeMes(cursor) };
  }, [cursor, vista]);

  const params = useMemo(
    () => ({
      tipo: "evento",
      limite: LIMITE,
      rangoAtributo: [
        {
          clave: "inicio",
          desde: sumarDias(periodo.desde, -HOLGURA_DIAS).toISOString(),
          hasta: periodo.hasta.toISOString(),
        },
      ],
    }),
    [periodo],
  );

  const lista = useObjetos(params);

  const eventos = useMemo(
    () =>
      (lista.data?.objetos ?? [])
        .map(interpretarEvento)
        .filter(
          (evento): evento is EventoCalendario =>
            evento !== undefined && solapa(evento, periodo.desde, periodo.hasta),
        )
        .map((evento) => {
          const movimiento = cambios[evento.objeto.id];
          return movimiento === undefined
            ? evento
            : { ...evento, inicio: movimiento.inicio, fin: movimiento.fin ?? evento.fin };
        }),
    [cambios, lista.data, periodo],
  );

  const semanas = useMemo(() => {
    if (vista !== "mes") {
      return [];
    }
    const celdas = construirMes(cursor);
    return Array.from({ length: celdas.length / 7 }, (_, indice) =>
      celdas.slice(indice * 7, indice * 7 + 7),
    );
  }, [cursor, vista]);

  const dias = useMemo(() => {
    if (vista === "semana") {
      return construirSemana(cursor);
    }
    if (vista === "dia") {
      return [construirDia(cursor)];
    }
    return [];
  }, [cursor, vista]);

  const etiqueta =
    vista === "semana"
      ? etiquetaSemana(cursor, locale)
      : vista === "dia"
        ? etiquetaDia(cursor, locale)
        : etiquetaMes(cursor, locale);

  const inicioMs = msDeValor(borrador.inicio, borrador.todoElDia, false);
  const finMs = msDeValor(borrador.fin, borrador.todoElDia, true);
  const rangoInvalido = inicioMs !== undefined && finMs !== undefined && finMs < inicioMs;
  const puedeCrear =
    borrador.titulo.trim() !== "" && inicioMs !== undefined && !rangoInvalido && !crear.isPending;

  const abrirNuevo = (dia: Date, hora = 9) => {
    crear.reset();
    setBorrador(borradorInicial(dia, hora));
    setDialogoAbierto(true);
  };

  const cambiarVista = (siguiente: Vista) => {
    setVista(siguiente);
    guardarVista(siguiente);
  };

  const mover = (direccion: -1 | 1) => {
    if (vista === "mes") {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + direccion, 1));
      return;
    }
    setCursor(sumarDias(cursor, vista === "semana" ? 7 * direccion : direccion));
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

  const iniciarArrastre = (evento: EventoCalendario) => {
    setArrastrandoId(evento.objeto.id);
  };

  const finalizarArrastre = () => {
    setArrastrandoId(null);
    setDestinoActivo(null);
  };

  const destacarDestino = (clave: string) => {
    setDestinoActivo((actual) => (actual === clave ? actual : clave));
  };

  const soltarEn = (destino: DestinoEvento) => {
    const id = arrastrandoId;
    setArrastrandoId(null);
    setDestinoActivo(null);
    if (id === null) {
      return;
    }
    const evento = eventos.find((item) => item.objeto.id === id);
    if (evento === undefined) {
      return;
    }
    const movimiento =
      destino.tipo === "dia"
        ? moverEventoADia(evento, destino.fecha)
        : moverEventoAHora(evento, destino.fecha, destino.hora);
    if (movimiento === undefined) {
      return;
    }
    const previo = cambios[id];
    setCambios((actuales) => ({ ...actuales, [id]: movimiento }));
    setAviso(null);
    moverEvento.mutate(
      {
        id,
        inicio: movimiento.inicio.toISOString(),
        ...(movimiento.fin === undefined ? {} : { fin: movimiento.fin.toISOString() }),
      },
      {
        onError: (error) => {
          setCambios((actuales) => {
            const siguientes: Record<string, MovimientoEvento> = { ...actuales };
            if (previo === undefined) {
              delete siguientes[id];
            } else {
              siguientes[id] = previo;
            }
            return siguientes;
          });
          setAviso(error instanceof ApiError ? error.mensaje : t("error.genericError"));
        },
      },
    );
  };

  const soltarEnDia = (fecha: Date) => soltarEn({ tipo: "dia", fecha });

  const soltarEnHora = (fecha: Date, hora: number) => soltarEn({ tipo: "hora", fecha, hora });

  const arrastre: ArrastreCalendario = {
    eventoId: arrastrandoId ?? undefined,
    destino: destinoActivo,
    onIniciar: iniciarArrastre,
    onFinalizar: finalizarArrastre,
    onDestacar: destacarDestino,
    onSoltarDia: soltarEnDia,
    onSoltarHora: soltarEnHora,
  };

  const nav = NAV_KEYS[vista];

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

      {aviso !== null ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
        >
          <span>
            <span className="font-medium">{t("page.calendario.moveError")}. </span>
            {aviso}
          </span>
          <button
            type="button"
            onClick={() => setAviso(null)}
            className="shrink-0 text-xs font-medium underline underline-offset-2"
          >
            {t("page.calendario.moveErrorDismiss")}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <nav
          aria-label={t("page.calendario.viewNav")}
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <h2 aria-live="polite" className="font-heading text-xl font-medium">
            {etiqueta}
          </h2>
          <nav aria-label={t("page.calendario.periodNav")} className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t(nav.anterior)}
              onClick={() => mover(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button type="button" variant="outline" onClick={() => setCursor(new Date())}>
              {t("page.calendario.today")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t(nav.siguiente)}
              onClick={() => mover(1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </nav>
        </div>
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
      ) : vista === "mes" ? (
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
                    const claveDestino = claveDestinoDia(celda.fecha);
                    return (
                      <td
                        key={celda.clave}
                        data-dia={celda.clave}
                        data-destino={destinoActivo === claveDestino ? "true" : undefined}
                        onDragOver={(eventoDrag) => {
                          eventoDrag.preventDefault();
                          destacarDestino(claveDestino);
                        }}
                        onDrop={(eventoDrag) => {
                          eventoDrag.preventDefault();
                          soltarEn({ tipo: "dia", fecha: celda.fecha });
                        }}
                        className={cn(
                          "border-b border-l border-border align-top first:border-l-0",
                          celda.fueraDeMes ? "bg-muted/40" : "bg-card",
                          destinoActivo === claveDestino
                            ? "bg-primary/5 ring-2 ring-primary/30 ring-inset"
                            : "",
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
                                  arrastrando={arrastrandoId === evento.objeto.id}
                                  onIniciarArrastre={iniciarArrastre}
                                  onFinalizarArrastre={finalizarArrastre}
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
      ) : (
        <VistaPeriodo
          dias={dias}
          eventos={eventos}
          etiqueta={etiqueta}
          onCrearEn={abrirNuevo}
          arrastre={arrastre}
        />
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
