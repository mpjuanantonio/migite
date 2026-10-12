import type { ObjectPayload } from "@migite/contracts";
import { Folder, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "@/api/api";
import { useCrearObjeto, useObjetosInfinitos } from "@/api/hooks";
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
import { formatFecha } from "@/lib/fecha";
import { ESTADO_ACTIVO, esEstadoProyecto, lineaResumen } from "@/lib/proyectos";

const LIMITE = 20;

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

const FilaProyecto = ({ proyecto }: { readonly proyecto: ObjectPayload }) => {
  const { t, locale } = useI18n();
  const estadoBruto = proyecto.atributos.estado;
  const estado = esEstadoProyecto(estadoBruto) ? estadoBruto : "";
  const resumen = lineaResumen(proyecto.cuerpo);

  return (
    <li>
      <article className="rounded-lg border border-border bg-card px-4 py-3.5 shadow-sheet">
        <h2 className="truncate font-heading text-lg font-medium">
          <Link
            to={`/proyectos/${encodeURIComponent(proyecto.id)}`}
            className="rounded-sm transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {proyecto.titulo}
          </Link>
        </h2>
        {resumen === "" ? null : (
          <p className="mt-1 line-clamp-1 max-w-prose text-sm text-muted-foreground">{resumen}</p>
        )}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span
            className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-medium ${estiloEstado(estado)}`}
          >
            {estado === "" ? t("page.proyectos.unknownStatus") : estado}
          </span>
          <span aria-hidden="true" className="h-3 w-px bg-border" />
          <time dateTime={proyecto.actualizado}>
            {t("page.proyectos.updated", {
              fecha: formatFecha(proyecto.actualizado, locale),
            })}
          </time>
        </p>
      </article>
    </li>
  );
};

export const ProyectosPage = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const crear = useCrearObjeto();

  const lista = useObjetosInfinitos({ tipo: "proyecto", limite: LIMITE });

  const proyectos = useMemo(() => {
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

  const abrirNuevo = () => {
    crear.reset();
    setNuevoAbierto(true);
  };

  const crearProyecto = () => {
    const limpio = titulo.trim();
    if (limpio === "" || crear.isPending) {
      return;
    }
    const cuerpo = descripcion.trim();
    crear.mutate(
      {
        tipo: "proyecto",
        titulo: limpio,
        atributos: { estado: ESTADO_ACTIVO },
        ...(cuerpo === "" ? {} : { cuerpo }),
      },
      {
        onSuccess: (proyecto) => {
          setNuevoAbierto(false);
          setTitulo("");
          setDescripcion("");
          crear.reset();
          navigate(`/proyectos/${encodeURIComponent(proyecto.id)}`);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="font-heading text-display font-medium">{t("page.proyectos.title")}</h1>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            {t("page.proyectos.description")}
          </p>
        </div>
        <Button type="button" onClick={abrirNuevo}>
          <Plus aria-hidden="true" />
          {t("page.proyectos.newProject")}
        </Button>
      </header>

      {lista.isPending ? (
        <section
          aria-busy="true"
          className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet"
        >
          <p role="status" className="text-sm text-muted-foreground">
            {t("page.proyectos.loading")}
          </p>
        </section>
      ) : null}

      {lista.isError ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <h2 className="font-heading text-xl font-medium">{t("page.proyectos.loadError")}</h2>
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            {lista.error instanceof ApiError ? lista.error.mensaje : t("error.genericError")}
          </p>
          <Button variant="outline" className="mt-6" onClick={() => void lista.refetch()}>
            {t("page.proyectos.retry")}
          </Button>
        </section>
      ) : null}

      {lista.isSuccess && proyectos.length === 0 ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <Folder aria-hidden="true" className="size-6 text-primary" strokeWidth={1.5} />
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            {t("page.proyectos.empty")}
          </p>
        </section>
      ) : null}

      {lista.isSuccess && proyectos.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {proyectos.map((proyecto) => (
            <FilaProyecto key={proyecto.id} proyecto={proyecto} />
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
              ? t("page.proyectos.loadingMore")
              : t("page.proyectos.loadMore")}
          </Button>
        </div>
      ) : null}

      <Dialog open={nuevoAbierto} onOpenChange={setNuevoAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("page.proyectos.newProjectTitle")}</DialogTitle>
            <DialogDescription>{t("page.proyectos.newProjectDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(evento) => {
              evento.preventDefault();
              crearProyecto();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="proyecto-titulo"
                className="text-xs font-medium text-muted-foreground"
              >
                {t("page.proyectos.titleLabel")}
              </label>
              <Input
                id="proyecto-titulo"
                value={titulo}
                onChange={(evento) => setTitulo(evento.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="proyecto-descripcion"
                className="text-xs font-medium text-muted-foreground"
              >
                {t("page.proyectos.descriptionLabel")}
              </label>
              <textarea
                id="proyecto-descripcion"
                rows={3}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                value={descripcion}
                onChange={(evento) => setDescripcion(evento.target.value)}
              />
            </div>
            {crear.isError ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
              >
                <span className="font-medium">{t("page.proyectos.createError")}. </span>
                {crear.error instanceof ApiError ? crear.error.mensaje : t("error.genericError")}
              </div>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={crear.isPending}>
                  {t("page.proyectos.createCancel")}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={titulo.trim() === "" || crear.isPending}>
                {crear.isPending ? t("page.proyectos.creating") : t("page.proyectos.createSubmit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
