import type { ObjectPayload } from "@migite/contracts";
import { CalendarClock, Plus, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/api/api";
import {
  type ObjetosListaParams,
  useCrearObjeto,
  useGuardarAtributos,
  useObjetosInfinitos,
} from "@/api/hooks";
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
import {
  ESTADO_HECHA,
  ESTADOS_PENDIENTES,
  ESTADOS_TAREA,
  type EstadoTarea,
  esEstadoTarea,
  esVencida,
  fechaLocal,
  finDelDia,
} from "@/lib/tareas";

const LIMITE = 20;

type Vista = "hoy" | "pendientes" | "todas";

const VISTAS = ["hoy", "pendientes", "todas"] as const satisfies readonly Vista[];

const VISTA_KEYS = {
  hoy: "page.tareas.viewToday",
  pendientes: "page.tareas.viewPending",
  todas: "page.tareas.viewAll",
} as const satisfies Record<Vista, AppTranslationKey>;

const VISTA_EMPTY_KEYS = {
  hoy: "page.tareas.emptyToday",
  pendientes: "page.tareas.emptyPending",
  todas: "page.tareas.emptyAll",
} as const satisfies Record<Vista, AppTranslationKey>;

const paramsDeVista = (vista: Vista, ahora: Date): ObjetosListaParams => {
  const base = { tipo: "tarea", limite: LIMITE };
  switch (vista) {
    case "hoy":
      return { ...base, rangoAtributo: [{ clave: "vencimiento", hasta: finDelDia(ahora) }] };
    case "pendientes":
      return { ...base, atributos: { estado: ESTADOS_PENDIENTES } };
    case "todas":
      return base;
  }
};

const estiloEstado = (estado: EstadoTarea | ""): string => {
  switch (estado) {
    case "en curso":
      return "border-primary/40 bg-primary/10 text-foreground";
    case "hecha":
      return "border-border bg-background text-muted-foreground line-through";
    default:
      return "border-border bg-muted text-foreground";
  }
};

type FilaTareaProps = {
  readonly tarea: ObjectPayload;
  readonly hoy: string;
};

const FilaTarea = ({ tarea, hoy }: FilaTareaProps) => {
  const { t } = useI18n();
  const guardar = useGuardarAtributos(tarea.id);
  const estadoBruto = tarea.atributos.estado;
  const estado = esEstadoTarea(estadoBruto) ? estadoBruto : "";
  const vencimiento =
    typeof tarea.atributos.vencimiento === "string" ? tarea.atributos.vencimiento : "";
  const vencida = esVencida(vencimiento, estadoBruto, hoy);

  const cambiarEstado = (nuevo: string) => {
    if (!esEstadoTarea(nuevo) || nuevo === estado || guardar.isPending) {
      return;
    }
    guardar.mutate({
      estado: nuevo,
      completada: nuevo === ESTADO_HECHA ? new Date().toISOString() : null,
    });
  };

  return (
    <li>
      <article className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border border-border bg-card px-4 py-3.5 shadow-sheet">
        <div className="min-w-0">
          <h2 className="truncate font-heading text-lg font-medium">
            <Link
              to={`/objetos/${encodeURIComponent(tarea.id)}`}
              className="rounded-sm transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {tarea.titulo}
            </Link>
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {vencimiento === "" ? (
              <span>{t("page.tareas.noDue")}</span>
            ) : (
              <time dateTime={vencimiento}>{vencimiento}</time>
            )}
            <span aria-hidden="true" className="h-3 w-px bg-border" />
            <span
              className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-medium ${estiloEstado(estado)}`}
            >
              {estado === "" ? t("page.tareas.unknownStatus") : estado}
            </span>
            {vencida ? (
              <span className="inline-flex items-center gap-1 rounded-sm border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive">
                <TriangleAlert aria-hidden="true" className="size-3" />
                {t("page.tareas.overdue")}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {guardar.isError ? (
            <p role="alert" className="max-w-48 text-xs text-destructive">
              {guardar.error instanceof ApiError
                ? guardar.error.mensaje
                : t("page.tareas.statusError")}
            </p>
          ) : null}
          <select
            aria-label={t("page.tareas.statusLabel", { titulo: tarea.titulo })}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
            value={estado}
            disabled={guardar.isPending}
            onChange={(evento) => cambiarEstado(evento.target.value)}
          >
            {estado === "" ? (
              <option value="" disabled>
                {t("page.tareas.unknownStatus")}
              </option>
            ) : null}
            {ESTADOS_TAREA.map((opcion) => (
              <option key={opcion} value={opcion}>
                {opcion}
              </option>
            ))}
          </select>
        </div>
      </article>
    </li>
  );
};

export const TareasPage = () => {
  const { t } = useI18n();
  const [vista, setVista] = useState<Vista>("hoy");
  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [vencimiento, setVencimiento] = useState("");
  const crear = useCrearObjeto();
  const hoy = fechaLocal(new Date());

  const lista = useObjetosInfinitos(paramsDeVista(vista, new Date()));

  const tareas = useMemo(() => {
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

  const abrirNueva = () => {
    crear.reset();
    setNuevaAbierta(true);
  };

  const crearTarea = () => {
    const limpio = titulo.trim();
    if (limpio === "" || crear.isPending) {
      return;
    }
    crear.mutate(
      {
        tipo: "tarea",
        titulo: limpio,
        atributos: {
          estado: "pendiente",
          ...(vencimiento === "" ? {} : { vencimiento }),
        },
      },
      {
        onSuccess: () => {
          setNuevaAbierta(false);
          setTitulo("");
          setVencimiento("");
          crear.reset();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="font-heading text-display font-medium">{t("page.tareas.title")}</h1>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            {t("page.tareas.description")}
          </p>
        </div>
        <Button type="button" onClick={abrirNueva}>
          <Plus aria-hidden="true" />
          {t("page.tareas.newTask")}
        </Button>
      </header>

      {!lista.isError ? (
        <nav aria-label={t("page.tareas.viewNav")} className="flex flex-wrap items-center gap-1.5">
          {VISTAS.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={vista === item ? "secondary" : "ghost"}
              aria-pressed={vista === item}
              onClick={() => setVista(item)}
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
            {t("page.tareas.loading")}
          </p>
        </section>
      ) : null}

      {lista.isError ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <h2 className="font-heading text-xl font-medium">{t("page.tareas.loadError")}</h2>
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            {lista.error instanceof ApiError ? lista.error.mensaje : t("error.genericError")}
          </p>
          <Button variant="outline" className="mt-6" onClick={() => void lista.refetch()}>
            {t("page.tareas.retry")}
          </Button>
        </section>
      ) : null}

      {lista.isSuccess && tareas.length === 0 ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <CalendarClock aria-hidden="true" className="size-6 text-primary" strokeWidth={1.5} />
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            {t(VISTA_EMPTY_KEYS[vista])}
          </p>
        </section>
      ) : null}

      {lista.isSuccess && tareas.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {tareas.map((tarea) => (
            <FilaTarea key={tarea.id} tarea={tarea} hoy={hoy} />
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
            {lista.isFetchingNextPage ? t("page.tareas.loadingMore") : t("page.tareas.loadMore")}
          </Button>
        </div>
      ) : null}

      <Dialog open={nuevaAbierta} onOpenChange={setNuevaAbierta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("page.tareas.newTaskTitle")}</DialogTitle>
            <DialogDescription>{t("page.tareas.newTaskDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(evento) => {
              evento.preventDefault();
              crearTarea();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tarea-titulo" className="text-xs font-medium text-muted-foreground">
                {t("page.tareas.titleLabel")}
              </label>
              <Input
                id="tarea-titulo"
                value={titulo}
                onChange={(evento) => setTitulo(evento.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="tarea-vencimiento"
                className="text-xs font-medium text-muted-foreground"
              >
                {t("page.tareas.dueLabel")}
              </label>
              <Input
                id="tarea-vencimiento"
                type="date"
                value={vencimiento}
                onChange={(evento) => setVencimiento(evento.target.value)}
              />
            </div>
            {crear.isError ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
              >
                <span className="font-medium">{t("page.tareas.createError")}. </span>
                {crear.error instanceof ApiError ? crear.error.mensaje : t("error.genericError")}
              </div>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={crear.isPending}>
                  {t("page.tareas.createCancel")}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={titulo.trim() === "" || crear.isPending}>
                {crear.isPending ? t("page.tareas.creating") : t("page.tareas.createSubmit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
