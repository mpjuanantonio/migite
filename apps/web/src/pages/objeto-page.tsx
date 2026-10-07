import { FileWarning, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "@/api/api";
import { useGuardarObjeto, useObjeto } from "@/api/hooks";
import { MarkdownEditor } from "@/components/editor/markdown-editor";
import { MarkdownPreview } from "@/components/editor/markdown-preview";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import { formatFecha } from "@/lib/fecha";

const etiquetaAtajo = (): string =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent)
    ? "⌘ S"
    : "Ctrl S";

export const ObjetoPage = () => {
  const { t, locale } = useI18n();
  const { id } = useParams();
  const objetoQuery = useObjeto(id);
  const guardar = useGuardarObjeto(id ?? "");
  const [borrador, setBorrador] = useState<{ readonly id: string; readonly valor: string }>();
  const [guardadoEn, setGuardadoEn] = useState<string>();

  const objeto = objetoQuery.data;
  const cuerpo =
    borrador !== undefined && borrador.id === id ? borrador.valor : (objeto?.cuerpo ?? "");
  const guardando = guardar.isPending;
  const conCambios =
    objeto !== undefined &&
    borrador !== undefined &&
    borrador.id === objeto.id &&
    borrador.valor !== objeto.cuerpo;
  const puedeGuardar = conCambios && !guardando;

  const guardarCuerpo = useCallback(() => {
    if (!puedeGuardar) {
      return;
    }
    guardar.mutate(cuerpo, { onSuccess: () => setGuardadoEn(id) });
  }, [puedeGuardar, cuerpo, guardar, id]);

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

  if (objetoQuery.error !== null || objeto === undefined) {
    const error = objetoQuery.error;
    const noEncontrado = error instanceof ApiError && error.status === 404;
    const mensaje = error instanceof ApiError ? error.mensaje : t("error.genericError");

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

  const estado = guardando
    ? t("page.objeto.saving")
    : conCambios
      ? t("page.objeto.unsaved")
      : guardadoEn === id
        ? t("page.objeto.saved")
        : t("page.objeto.clean");

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
          <div className="flex items-center gap-2">
            <p role="status" aria-live="polite" className="mr-1 text-sm text-muted-foreground">
              {estado}
            </p>
            <Button
              type="button"
              onClick={guardarCuerpo}
              disabled={!puedeGuardar}
              title={`${t("page.objeto.save")} (${etiquetaAtajo()})`}
            >
              <Save aria-hidden="true" />
              {guardando ? t("page.objeto.saving") : t("page.objeto.save")}
            </Button>
            <kbd className="hidden rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[0.7rem] text-muted-foreground sm:inline-block">
              {etiquetaAtajo()}
            </kbd>
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

      {guardar.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
        >
          <p className="max-w-prose">
            <span className="font-medium">{t("page.objeto.saveError")}. </span>
            {guardar.error instanceof ApiError ? guardar.error.mensaje : t("error.genericError")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={guardarCuerpo}
            disabled={guardando}
          >
            {t("page.objeto.retry")}
          </Button>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sheet">
        <div className="grid lg:grid-cols-2">
          <section
            aria-label={t("page.objeto.editor")}
            className="flex flex-col border-b border-border lg:border-r lg:border-b-0"
          >
            <header className="flex h-10 items-center border-b border-border/70 px-4">
              <h2 className="text-xs font-medium text-muted-foreground">
                {t("page.objeto.editor")}
              </h2>
            </header>
            <div className="h-[22rem] sm:h-[30rem]">
              <MarkdownEditor
                value={cuerpo}
                onChange={(valor) => setBorrador({ id: objeto.id, valor })}
                ariaLabel={t("page.objeto.editorLabel")}
                placeholder={t("page.objeto.editorPlaceholder")}
              />
            </div>
          </section>
          <section aria-label={t("page.objeto.preview")} className="flex flex-col">
            <header className="flex h-10 items-center border-b border-border/70 px-4">
              <h2 className="text-xs font-medium text-muted-foreground">
                {t("page.objeto.preview")}
              </h2>
            </header>
            <div className="h-[22rem] overflow-y-auto px-5 py-4 sm:h-[30rem] lg:px-6">
              <MarkdownPreview markdown={cuerpo} emptyLabel={t("page.objeto.previewEmpty")} />
            </div>
          </section>
        </div>
      </section>
    </div>
  );
};
