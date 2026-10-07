import { Link } from "react-router-dom";
import { useI18n } from "@/i18n/context";
import {
  type CeldaDia,
  claveDestinoDia,
  claveDestinoHora,
  claveHora,
  compararEventos,
  distribuirEventos,
  type EventoCalendario,
  etiquetaDia,
  eventosDelDia,
  formatearDia,
  formatearHora,
  HORAS_DEL_DIA,
  nombreDiaCorto,
  prepararArrastre,
} from "@/lib/calendario";
import { cn } from "@/lib/utils";
import { ChipEvento } from "./chip-evento";

const ALTURA_HORA = "h-12";
const GUTTER = "3.5rem";

export type ArrastreCalendario = {
  readonly eventoId: string | undefined;
  readonly destino: string | null;
  readonly onIniciar: (evento: EventoCalendario) => void;
  readonly onFinalizar: () => void;
  readonly onDestacar: (clave: string) => void;
  readonly onSoltarDia: (fecha: Date) => void;
  readonly onSoltarHora: (fecha: Date, hora: number) => void;
};

type VistaPeriodoProps = {
  readonly dias: readonly CeldaDia[];
  readonly eventos: readonly EventoCalendario[];
  readonly etiqueta: string;
  readonly onCrearEn: (dia: Date, hora: number) => void;
  readonly arrastre: ArrastreCalendario;
};

export const VistaPeriodo = ({
  dias,
  eventos,
  etiqueta,
  onCrearEn,
  arrastre,
}: VistaPeriodoProps) => {
  const { locale, t } = useI18n();
  const columnas = `${GUTTER} repeat(${dias.length}, minmax(0, 1fr))`;
  const esDia = dias.length === 1;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sheet">
      <section
        aria-label={etiqueta}
        data-vista={esDia ? "dia" : "semana"}
        className="min-w-[44rem]"
      >
        <div className="grid border-b border-border" style={{ gridTemplateColumns: columnas }}>
          <div aria-hidden="true" />
          {dias.map((celda) => (
            <div
              key={celda.clave}
              data-cabecera={celda.clave}
              data-hoy={celda.esHoy ? "true" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 border-l border-border px-2 py-2 text-center",
                celda.esHoy ? "bg-primary/5" : "",
              )}
            >
              {esDia ? (
                <span className="font-heading text-sm font-medium">
                  {etiquetaDia(celda.fecha, locale)}
                </span>
              ) : (
                <>
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {nombreDiaCorto(celda.fecha, locale)}
                  </span>
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full font-heading text-sm",
                      celda.esHoy ? "bg-primary font-semibold text-primary-foreground" : "",
                    )}
                  >
                    {celda.fecha.getDate()}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>

        <div
          className="grid border-b border-border bg-muted/20"
          style={{ gridTemplateColumns: columnas }}
        >
          <div className="px-1.5 py-1.5 text-right text-[0.65rem] leading-tight font-medium tracking-wide text-muted-foreground uppercase">
            {t("page.calendario.allDay")}
          </div>
          {dias.map((celda) => {
            const delDia = eventosDelDia(eventos, celda.fecha)
              .filter((evento) => evento.todoElDia)
              .sort(compararEventos);
            const clave = claveDestinoDia(celda.fecha);
            return (
              <section
                key={celda.clave}
                aria-label={formatearDia(celda.fecha, locale)}
                data-todo-el-dia={celda.clave}
                data-destino={arrastre.destino === clave ? "true" : undefined}
                onDragOver={(eventoDrag) => {
                  eventoDrag.preventDefault();
                  arrastre.onDestacar(clave);
                }}
                onDrop={(eventoDrag) => {
                  eventoDrag.preventDefault();
                  arrastre.onSoltarDia(celda.fecha);
                }}
                className={cn(
                  "min-h-9 border-l border-border px-1 py-1",
                  arrastre.destino === clave
                    ? "bg-primary/10 ring-2 ring-primary/40 ring-inset"
                    : "",
                )}
              >
                {delDia.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {delDia.map((evento) => (
                      <ChipEvento
                        key={evento.objeto.id}
                        evento={evento}
                        arrastrando={arrastre.eventoId === evento.objeto.id}
                        onIniciarArrastre={arrastre.onIniciar}
                        onFinalizarArrastre={arrastre.onFinalizar}
                      />
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>

        <div className="grid" style={{ gridTemplateColumns: columnas }}>
          <div aria-hidden="true">
            {HORAS_DEL_DIA.map((hora) => (
              <div
                key={hora}
                className={cn(
                  "flex items-start justify-end border-b border-border/60 pr-2",
                  ALTURA_HORA,
                )}
              >
                <span className="text-[0.65rem] tabular-nums text-muted-foreground">
                  {claveHora(hora)}
                </span>
              </div>
            ))}
          </div>
          {dias.map((celda) => {
            const posicionados = distribuirEventos(eventos, celda.fecha);
            return (
              <div
                key={celda.clave}
                data-dia={celda.clave}
                className="relative border-l border-border"
              >
                <div className="flex flex-col">
                  {HORAS_DEL_DIA.map((hora) => {
                    const clave = claveDestinoHora(celda.fecha, hora);
                    return (
                      <button
                        key={hora}
                        type="button"
                        data-hora={hora}
                        data-destino={arrastre.destino === clave ? "true" : undefined}
                        onClick={() => onCrearEn(celda.fecha, hora)}
                        onDragOver={(eventoDrag) => {
                          eventoDrag.preventDefault();
                          arrastre.onDestacar(clave);
                        }}
                        onDrop={(eventoDrag) => {
                          eventoDrag.preventDefault();
                          arrastre.onSoltarHora(celda.fecha, hora);
                        }}
                        aria-label={t("page.calendario.addOnDayAt", {
                          fecha: formatearDia(celda.fecha, locale),
                          hora: claveHora(hora),
                        })}
                        className={cn(
                          "w-full border-b border-border/60 transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                          ALTURA_HORA,
                          arrastre.destino === clave
                            ? "bg-primary/10 ring-2 ring-primary/30 ring-inset"
                            : "",
                        )}
                      />
                    );
                  })}
                </div>
                {posicionados.map((posicion) => (
                  <Link
                    key={posicion.evento.objeto.id}
                    to={`/objetos/${encodeURIComponent(posicion.evento.objeto.id)}`}
                    data-evento={posicion.evento.objeto.id}
                    draggable
                    data-arrastrando={
                      arrastre.eventoId === posicion.evento.objeto.id ? "true" : undefined
                    }
                    onDragStart={(eventoDrag) => {
                      prepararArrastre(eventoDrag.dataTransfer, posicion.evento.objeto.id);
                      arrastre.onIniciar(posicion.evento);
                    }}
                    onDragEnd={arrastre.onFinalizar}
                    style={{
                      top: `${posicion.top}%`,
                      height: `${posicion.alto}%`,
                      left: `${(posicion.columna / posicion.columnas) * 100}%`,
                      width: `${100 / posicion.columnas}%`,
                    }}
                    className={cn(
                      "absolute z-10 flex cursor-grab items-baseline gap-1 overflow-hidden rounded-sm border border-primary/40 bg-primary/10 px-1 py-0.5 text-xs leading-snug transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing",
                      arrastre.eventoId !== undefined ? "pointer-events-none" : "",
                      arrastre.eventoId === posicion.evento.objeto.id ? "opacity-60" : "",
                    )}
                  >
                    <time
                      dateTime={posicion.evento.inicio.toISOString()}
                      className="shrink-0 font-medium tabular-nums text-muted-foreground"
                    >
                      {formatearHora(posicion.evento.inicio, locale)}
                    </time>
                    <span className="truncate font-medium text-foreground">
                      {posicion.evento.objeto.titulo}
                    </span>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
