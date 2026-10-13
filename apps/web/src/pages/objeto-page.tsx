import type { ObjectPayload, RenameReport } from "@migite/contracts";
import { CircleCheck, FileWarning, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError } from "@/api/api";
import {
  useBorrarObjeto,
  useGuardarObjeto,
  useObjeto,
  useObjetos,
  useRenombrarObjeto,
} from "@/api/hooks";
import { BandejaAtributos } from "@/components/atributos/bandeja-atributos";
import { MarkdownEditor } from "@/components/editor/markdown-editor";
import { Wikilink } from "@/components/editor/wikilink";
import { type EstadoGuardado, IndicadorGuardado } from "@/components/objetos/indicador-guardado";
import { PanelEnlacesEntrantes } from "@/components/objetos/panel-enlaces-entrantes";
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

const DEBOUNCE_GUARDADO_MS = 1200;

type InformeRenombrado = RenameReport["informe"];

const AvisoInforme = ({ informe }: { readonly informe: InformeRenombrado }) => {
  const { t } = useI18n();

  if (informe.omitidos.length === 0 && informe.enlacesSinResolver.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {informe.omitidos.length > 0 ? (
        <div className="rounded-md border border-chart-4/40 bg-chart-4/10 px-3.5 py-2.5">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-chart-4" />
            {t("page.objeto.renameOmitted")}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("page.objeto.renameOmittedHint")}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1 text-sm">
            {informe.omitidos.map((entrada) => (
              <li key={entrada.path}>
                <code className="text-xs">{entrada.path}</code>
                <span className="text-muted-foreground"> — {entrada.problems.join("; ")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {informe.enlacesSinResolver.length > 0 ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5"
        >
          <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
            {t("page.objeto.renameUnresolved")}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("page.objeto.renameUnresolvedHint")}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1 text-sm">
            {informe.enlacesSinResolver.map((enlace) => (
              <li key={`${enlace.path}:${enlace.link}`}>
                {t("page.objeto.renameUnresolvedAt", { link: enlace.link, path: enlace.path })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

const PanelInforme = ({
  informe,
  onCerrar,
}: {
  readonly informe: InformeRenombrado;
  readonly onCerrar: () => void;
}) => {
  const { t } = useI18n();

  return (
    <section
      aria-label={t("page.objeto.renameSuccess")}
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sheet"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/70 px-4 py-3">
        <p role="status" className="flex items-center gap-2 text-sm font-medium">
          <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />
          {t("page.objeto.renameSuccess")}
        </p>
        <Button type="button" variant="ghost" size="xs" onClick={onCerrar}>
          {t("page.objeto.renameDismiss")}
        </Button>
      </header>
      <div className="flex flex-col gap-3 px-4 py-3">
        {informe.reescritos.length > 0 ? (
          <div>
            <h3 className="text-sm font-medium">
              {t("page.objeto.renameRewritten", { total: informe.reescritos.length })}
            </h3>
            <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-sm text-muted-foreground">
              {informe.reescritos.map((path) => (
                <li key={path}>
                  <code className="text-xs">{path}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("page.objeto.renameRewrittenNone")}</p>
        )}

        <AvisoInforme informe={informe} />
      </div>
    </section>
  );
};

export const ObjetoPage = () => {
  const { t, locale } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const objetoQuery = useObjeto(id);
  const objetosSugeridos = useObjetos({ limite: 100 });
  const guardar = useGuardarObjeto(id ?? "");
  const {
    isError: falloAlGuardar,
    isPending: guardando,
    mutate: guardarCuerpoAhora,
    mutateAsync: guardarCuerpoYEsperar,
    reset: descartarFalloAlGuardar,
  } = guardar;
  const renombrar = useRenombrarObjeto(id ?? "");
  const borrar = useBorrarObjeto();
  const [borrador, setBorrador] = useState<{ readonly id: string; readonly valor: string }>();
  const [guardadoEn, setGuardadoEn] = useState<string>();
  const [renombrarAbierto, setRenombrarAbierto] = useState(false);
  const [nuevoTitulo, setNuevoTitulo] = useState("");
  const [informe, setInforme] = useState<InformeRenombrado>();
  const [borrarAbierto, setBorrarAbierto] = useState(false);
  const [wikilinkTitulo, setWikilinkTitulo] = useState<string>();

  const objeto: ObjectPayload | null | undefined = objetoQuery.data;
  const titulosSugeridos = (objetosSugeridos.data?.objetos ?? []).map((item) => item.titulo);
  const cuerpo =
    borrador !== undefined && borrador.id === id ? borrador.valor : (objeto?.cuerpo ?? "");
  const conCambios =
    objeto !== null &&
    objeto !== undefined &&
    borrador !== undefined &&
    borrador.id === objeto.id &&
    borrador.valor !== objeto.cuerpo;
  const puedeGuardar = conCambios && !guardando;

  const limpiarBorradorGuardado = useCallback(
    (guardado: string) => {
      setBorrador((previo) =>
        previo !== undefined && previo.id === id && previo.valor === guardado ? undefined : previo,
      );
    },
    [id],
  );

  const guardarCuerpo = useCallback(() => {
    if (!puedeGuardar) {
      return;
    }
    guardarCuerpoAhora(cuerpo, {
      onSuccess: () => {
        limpiarBorradorGuardado(cuerpo);
        setGuardadoEn(id);
      },
    });
  }, [puedeGuardar, cuerpo, guardarCuerpoAhora, limpiarBorradorGuardado, id]);

  const guardarAntesDeCrear = useCallback(async (): Promise<void> => {
    if (!conCambios) {
      return;
    }
    await guardarCuerpoYEsperar(cuerpo);
    limpiarBorradorGuardado(cuerpo);
    setGuardadoEn(id);
  }, [conCambios, cuerpo, guardarCuerpoYEsperar, limpiarBorradorGuardado, id]);

  useEffect(() => {
    if (!conCambios || guardando || falloAlGuardar) {
      return;
    }
    const temporizador = setTimeout(guardarCuerpo, DEBOUNCE_GUARDADO_MS);
    return () => clearTimeout(temporizador);
  }, [conCambios, guardando, falloAlGuardar, guardarCuerpo]);

  const estadoGuardado: EstadoGuardado = falloAlGuardar
    ? "error"
    : guardando || conCambios
      ? "guardando"
      : guardadoEn === id
        ? "guardado"
        : "inactivo";

  const abrirWikilink = useCallback((titulo: string) => {
    setWikilinkTitulo(titulo);
  }, []);

  const cerrarWikilink = useCallback(() => {
    setWikilinkTitulo(undefined);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "s" || event.altKey || (!event.ctrlKey && !event.metaKey)) {
        return;
      }
      event.preventDefault();
      guardarCuerpo();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [guardarCuerpo]);

  if (objetoQuery.isPending) {
    return (
      <section
        aria-busy="true"
        className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet"
      >
        <h1 className="font-heading text-display font-medium">{t("page.objeto.title")}</h1>
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {t("page.objeto.loading")}
        </p>
      </section>
    );
  }

  if (objetoQuery.error !== null || objeto === null || objeto === undefined) {
    const error = objetoQuery.error;
    const noEncontrado = objeto === null || (error instanceof ApiError && error.status === 404);
    const mensaje =
      error instanceof ApiError
        ? error.mensaje
        : noEncontrado
          ? t("error.notFound")
          : t("error.genericError");

    return (
      <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
        <h1 className="font-heading text-display font-medium">
          {noEncontrado ? t("page.objeto.notFound") : t("page.objeto.loadError")}
        </h1>
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">{mensaje}</p>
        <Button variant="outline" className="mt-6" onClick={() => void objetoQuery.refetch()}>
          {t("page.objeto.retry")}
        </Button>
      </section>
    );
  }

  const abrirRenombrar = () => {
    setNuevoTitulo(objeto.titulo);
    renombrar.reset();
    setRenombrarAbierto(true);
  };

  const confirmarRenombrar = () => {
    const titulo = nuevoTitulo.trim();
    if (titulo === "" || renombrar.isPending) {
      return;
    }
    renombrar.mutate(titulo, {
      onSuccess: (reporte) => {
        setRenombrarAbierto(false);
        setInforme(reporte.informe);
      },
    });
  };

  const abrirBorrar = () => {
    borrar.reset();
    setBorrarAbierto(true);
  };

  const confirmarBorrar = () => {
    if (borrar.isPending) {
      return;
    }
    borrar.mutate(objeto.id, {
      onSuccess: () => {
        setBorrarAbierto(false);
        navigate("/notas");
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <h1 className="font-heading text-display font-medium break-words">{objeto.titulo}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="rounded-sm border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">
                {objeto.tipo}
              </span>
              <span aria-hidden="true" className="h-3 w-px bg-border" />
              <span>
                {t("page.objeto.updated", {
                  fecha: formatFecha(objeto.actualizado, locale),
                })}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={abrirRenombrar}>
              <Pencil aria-hidden="true" />
              {t("page.objeto.rename")}
            </Button>
            <Button type="button" variant="destructive" onClick={abrirBorrar}>
              <Trash2 aria-hidden="true" />
              {t("page.objeto.delete")}
            </Button>
          </div>
        </div>
        {objeto.degraded.length > 0 ? (
          <div className="flex items-start gap-3 rounded-md border border-chart-4/40 bg-chart-4/10 px-3.5 py-2.5">
            <FileWarning aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-chart-4" />
            <div className="text-sm">
              <p className="font-medium">{t("page.objeto.degraded")}</p>
              <p className="mt-0.5 text-muted-foreground">{t("page.objeto.degradedHint")}</p>
            </div>
          </div>
        ) : null}
      </header>

      <BandejaAtributos key={objeto.id} objeto={objeto} />

      {informe !== undefined ? (
        <PanelInforme informe={informe} onCerrar={() => setInforme(undefined)} />
      ) : null}

      <section
        aria-label={t("page.objeto.editor")}
        className="editor-lectura relative overflow-hidden rounded-lg border border-border/70 bg-card shadow-sheet"
        onBlur={(evento) => {
          const destino = evento.relatedTarget;
          if (destino instanceof Node && evento.currentTarget.contains(destino)) {
            return;
          }
          guardarCuerpo();
        }}
      >
        <div className="pointer-events-none absolute top-2 right-2 z-10 rounded-md bg-card/80 px-1 py-0.5 shadow-xs backdrop-blur-sm">
          <IndicadorGuardado
            estado={estadoGuardado}
            mensaje={guardar.error instanceof ApiError ? guardar.error.mensaje : undefined}
            onReintentar={guardarCuerpo}
          />
        </div>
        <div className="h-[30rem] sm:h-[40rem]">
          <MarkdownEditor
            value={cuerpo}
            onChange={(valor) => {
              if (falloAlGuardar) {
                descartarFalloAlGuardar();
              }
              setBorrador({ id: objeto.id, valor });
            }}
            ariaLabel={t("page.objeto.editorLabel")}
            placeholder={t("page.objeto.editorPlaceholder")}
            sugerencias={titulosSugeridos}
            onWikilinkClick={abrirWikilink}
          />
        </div>
      </section>

      <PanelEnlacesEntrantes id={objeto.id} />

      <Dialog open={renombrarAbierto} onOpenChange={setRenombrarAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("page.objeto.renameTitle")}</DialogTitle>
            <DialogDescription>{t("page.objeto.renameDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              confirmarRenombrar();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="objeto-nuevo-titulo"
                className="text-xs font-medium text-muted-foreground"
              >
                {t("page.objeto.renameLabel")}
              </label>
              <Input
                id="objeto-nuevo-titulo"
                value={nuevoTitulo}
                onChange={(event) => setNuevoTitulo(event.target.value)}
              />
            </div>
            {renombrar.isError ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
              >
                <span className="font-medium">{t("page.objeto.renameError")}. </span>
                {renombrar.error instanceof ApiError
                  ? renombrar.error.mensaje
                  : t("error.genericError")}
              </div>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={renombrar.isPending}>
                  {t("page.objeto.renameCancel")}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={nuevoTitulo.trim() === "" || renombrar.isPending}>
                {renombrar.isPending ? t("page.objeto.renaming") : t("page.objeto.renameSubmit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={borrarAbierto} onOpenChange={setBorrarAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("page.objeto.deleteTitle", { titulo: objeto.titulo })}</DialogTitle>
            <DialogDescription>{t("page.objeto.deleteWarning")}</DialogDescription>
          </DialogHeader>
          {borrar.isError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
            >
              <span className="font-medium">{t("page.objeto.deleteError")}. </span>
              {borrar.error instanceof ApiError ? borrar.error.mensaje : t("error.genericError")}
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={borrar.isPending}>
                {t("page.objeto.deleteCancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={borrar.isPending}
              onClick={confirmarBorrar}
            >
              <Trash2 aria-hidden="true" />
              {borrar.isPending
                ? t("page.objeto.deleteConfirming")
                : t("page.objeto.deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={wikilinkTitulo !== undefined}
        onOpenChange={(abierto) => {
          if (!abierto) {
            setWikilinkTitulo(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{wikilinkTitulo}</DialogTitle>
            <DialogDescription>
              {t("page.objeto.wikilink.unresolved", { titulo: wikilinkTitulo ?? "" })}
            </DialogDescription>
          </DialogHeader>
          {wikilinkTitulo === undefined ? null : (
            <Wikilink
              titulo={wikilinkTitulo}
              antesDeCrear={guardarAntesDeCrear}
              autoNavegar
              onNavegar={cerrarWikilink}
            >
              {wikilinkTitulo}
            </Wikilink>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
