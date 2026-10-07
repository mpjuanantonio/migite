import { Link } from "react-router-dom";
import { useI18n } from "@/i18n/context";
import { type EventoCalendario, formatearHora, prepararArrastre } from "@/lib/calendario";
import { cn } from "@/lib/utils";

type ChipEventoProps = {
  readonly evento: EventoCalendario;
  readonly arrastrando?: boolean;
  readonly onIniciarArrastre?: (evento: EventoCalendario) => void;
  readonly onFinalizarArrastre?: () => void;
};

export const ChipEvento = ({
  evento,
  arrastrando = false,
  onIniciarArrastre,
  onFinalizarArrastre,
}: ChipEventoProps) => {
  const { locale, t } = useI18n();

  return (
    <li>
      <Link
        to={`/objetos/${encodeURIComponent(evento.objeto.id)}`}
        draggable
        data-todo-el-dia={evento.todoElDia ? "true" : undefined}
        data-arrastrando={arrastrando ? "true" : undefined}
        onDragStart={(eventoDrag) => {
          prepararArrastre(eventoDrag.dataTransfer, evento.objeto.id);
          onIniciarArrastre?.(evento);
        }}
        onDragEnd={onFinalizarArrastre}
        className={cn(
          "flex cursor-grab items-start gap-1.5 rounded-sm border px-1.5 py-1 text-xs leading-snug transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing",
          evento.todoElDia
            ? "border-primary/40 bg-primary/10 hover:bg-primary/15"
            : "border-border bg-background hover:border-primary/40",
          arrastrando ? "opacity-60" : "",
        )}
      >
        {evento.todoElDia ? (
          <span className="sr-only">{t("page.calendario.allDay")}</span>
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
};
