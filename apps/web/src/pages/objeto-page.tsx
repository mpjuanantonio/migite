import type { ObjectPayload, RenameReport } from "@migite/contracts";
import { FileWarning, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
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
import type { ContextoExplorador } from "@/components/layout/app-shell";
import { type EstadoGuardado, IndicadorGuardado } from "@/components/objetos/indicador-guardado";
import { PanelEnlacesEntrantes } from "@/components/objetos/panel-enlaces-entrantes";
import { TituloEditable } from "@/components/objetos/titulo-editable";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n/context";
import { formatFecha } from "@/lib/fecha";

const DEBOUNCE_GUARDADO_MS = 1200;

type InformeRenombrado = RenameReport["informe"];

const AvisoRenombrado = ({ informe }: { readonly informe: InformeRenombrado }) => {
  const { t } = useI18n();

  if (informe.omitidos.length === 0 && informe.enlacesSinResolver.length === 0) {
    return null;
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-1 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground"
    >
      {informe.omitidos.length > 0 ? (
        <p>
          <span className="font-medium text-foreground">{t("page.objeto.renameOmitted")}</span>:{" "}
          {informe.omitidos
            .map((entrada) => `${entrada.path} (${entrada.problems.join("; ")})`)
            .join(", ")}
        </p>
      ) : null}
      {informe.enlacesSinResolver.length > 0 ? (
        <p>
          <span className="font-medium text-foreground">{t("page.objeto.renameUnresolved")}</span>:{" "}
          {informe.enlacesSinResolver
            .map((enlace) =>
              t("page.objeto.renameUnresolvedAt", { link: enlace.link, path: enlace.path }),
            )
            .join("; ")}
        </p>
      ) : null}
    </div>
  );
};

const GuardadoDeBorradorPendiente = ({
  idObjeto,
  pendiente,
}: {
  readonly idObjeto: string;
  readonly pendiente: { readonly current: string | undefined };
}) => {
  const { mutate } = useGuardarObjeto(idObjeto);

  useEffect(
    () => () => {
      const valor = pendiente.current;
      if (valor !== undefined) {
        mutate(valor);
      }
    },
    [mutate, pendiente],
  );

  return null;
};

export const ObjetoPage = () => {
  const { t, locale } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const { fijarCarpeta } = useOutletContext<ContextoExplorador>();
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
  const [informe, setInforme] = useState<InformeRenombrado>();
  const [borrarAbierto, setBorrarAbierto] = useState(false);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [wikilinkTitulo, setWikilinkTitulo] = useState<string>();
  const [idAnterior, setIdAnterior] = useState(id);
  const borradorPendiente = useRef<string | undefined>(undefined);
  const menuRestauraFoco = useRef(true);

  if (idAnterior !== id) {
    setIdAnterior(id);
    setInforme(undefined);
    setAltaAbierta(false);
  }

  const objeto: ObjectPayload | null | undefined = objetoQuery.data;

  useEffect(() => {
    if (objeto === undefined || objeto === null) {
      return;
    }
    fijarCarpeta(objeto.carpeta);
  }, [objeto, fijarCarpeta]);

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

  useEffect(() => {
    borradorPendiente.current = conCambios ? cuerpo : undefined;
  }, [conCambios, cuerpo]);

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

  useEffect(() => {
    const avisarAntesDeDescargar = (evento: BeforeUnloadEvent) => {
      if (borradorPendiente.current === undefined) {
        return;
      }
      evento.preventDefault();
      evento.returnValue = "";
    };
    window.addEventListener("beforeunload", avisarAntesDeDescargar);
    return () => window.removeEventListener("beforeunload", avisarAntesDeDescargar);
  }, []);

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

  const renombrarTitulo = (titulo: string) => {
    if (renombrar.isPending) {
      return;
    }
    renombrar.reset();
    renombrar.mutate(titulo, {
      onSuccess: (reporte) => {
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
    <article className="flex flex-col gap-6 rounded-lg border border-border bg-card px-5 py-6 shadow-sheet sm:px-8 sm:py-8">
      <GuardadoDeBorradorPendiente
        key={objeto.id}
        idObjeto={objeto.id}
        pendiente={borradorPendiente}
      />
      <header className="flex flex-col gap-4 border-b border-border pb-5">
        <div className="flex items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0 flex-1">
            <TituloEditable titulo={objeto.titulo} onRenombrar={renombrarTitulo} />
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
          <div className="flex shrink-0 items-center gap-0.5">
            <IndicadorGuardado
              estado={estadoGuardado}
              mensaje={guardar.error instanceof ApiError ? guardar.error.mensaje : undefined}
              onReintentar={guardarCuerpo}
            />
            <DropdownMenu
              onOpenChange={(abierto) => {
                if (abierto) {
                  menuRestauraFoco.current = true;
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("page.objeto.menu.label")}
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                onCloseAutoFocus={(evento) => {
                  if (!menuRestauraFoco.current) {
                    evento.preventDefault();
                  }
                }}
              >
                <DropdownMenuItem
                  onSelect={() => {
                    menuRestauraFoco.current = false;
                    setAltaAbierta(true);
                  }}
                >
                  <Plus aria-hidden="true" />
                  {t("page.objeto.menu.addAttribute")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
                  onSelect={abrirBorrar}
                >
                  <Trash2 aria-hidden="true" />
                  {t("page.objeto.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        {renombrar.isError ? (
          <p role="alert" className="text-xs text-destructive">
            <span className="font-medium">{t("page.objeto.renameError")}. </span>
            {renombrar.error instanceof ApiError
              ? renombrar.error.mensaje
              : t("error.genericError")}
          </p>
        ) : null}
        {informe !== undefined ? <AvisoRenombrado informe={informe} /> : null}
      </header>

      <BandejaAtributos
        key={objeto.id}
        objeto={objeto}
        altaAbierta={altaAbierta}
        onCerrarAlta={() => setAltaAbierta(false)}
      />

      <section
        aria-label={t("page.objeto.editor")}
        className="editor-lectura"
        onBlur={(evento) => {
          const destino = evento.relatedTarget;
          if (destino instanceof Node && evento.currentTarget.contains(destino)) {
            return;
          }
          guardarCuerpo();
        }}
      >
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
    </article>
  );
};
