import type { Memoria } from "@migite/contracts";
import { Brain, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/api/api";
import { useActualizarMemoria, useBorrarMemoria, useMemorias } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import { formatFecha } from "@/lib/fecha";
import { cn } from "@/lib/utils";

const LIMITE_CONTENIDO = 160;

const ESTILO_EDITOR =
  "min-h-20 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30";

type FichaMemoriaProps = {
  readonly memoria: Memoria;
};

const FichaMemoria = ({ memoria }: FichaMemoriaProps) => {
  const { t, locale } = useI18n();
  const actualizar = useActualizarMemoria();
  const borrar = useBorrarMemoria();
  const [expandida, setExpandida] = useState(false);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(memoria.contenido);
  const [porBorrar, setPorBorrar] = useState(false);

  const abrirEdicion = (): void => {
    setTexto(memoria.contenido);
    setEditando(true);
  };

  const guardar = (): void => {
    const contenido = texto.trim();
    if (contenido === "" || actualizar.isPending) {
      return;
    }
    actualizar.mutate({ id: memoria.id, contenido }, { onSuccess: () => setEditando(false) });
  };

  const confirmarBorrado = (): void => {
    borrar.mutate(memoria.id, { onSuccess: () => setPorBorrar(false) });
  };

  const fallo = actualizar.error ?? borrar.error;
  const mensajeError =
    fallo instanceof ApiError
      ? fallo.mensaje
      : actualizar.isError
        ? t("page.memoria.saveError")
        : borrar.isError
          ? t("page.memoria.deleteError")
          : null;
  const largo = memoria.contenido.length > LIMITE_CONTENIDO;

  return (
    <article className="rounded-lg border border-border bg-card px-4 py-3.5 shadow-sheet">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h2 className="min-w-0 font-heading text-lg font-medium break-words">{memoria.clave}</h2>
        <time dateTime={memoria.actualizada} className="text-xs text-muted-foreground">
          {t("page.memoria.updated", {
            fecha: formatFecha(memoria.actualizada, locale, {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          })}
        </time>
      </div>

      {editando ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            rows={3}
            value={texto}
            disabled={actualizar.isPending}
            aria-label={t("page.memoria.editLabel", { clave: memoria.clave })}
            onChange={(evento) => setTexto(evento.target.value)}
            className={ESTILO_EDITOR}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={guardar}
              disabled={actualizar.isPending || texto.trim() === ""}
            >
              {actualizar.isPending ? t("page.memoria.saving") : t("page.memoria.save")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditando(false)}
              disabled={actualizar.isPending}
            >
              {t("page.memoria.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p
            className={cn(
              "mt-2 max-w-prose text-sm whitespace-pre-wrap",
              largo && !expandida && "line-clamp-2",
            )}
          >
            {memoria.contenido}
          </p>
          {largo ? (
            <button
              type="button"
              aria-expanded={expandida}
              onClick={() => setExpandida((abierta) => !abierta)}
              className="mt-1 text-xs font-medium text-primary transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {expandida ? t("page.memoria.collapse") : t("page.memoria.expand")}
            </button>
          ) : null}
        </>
      )}

      {porBorrar ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("page.memoria.deleteConfirm")}</span>
          <Button
            type="button"
            size="xs"
            variant="destructive"
            onClick={confirmarBorrado}
            disabled={borrar.isPending}
          >
            {t("page.memoria.deleteYes")}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => setPorBorrar(false)}
            disabled={borrar.isPending}
          >
            {t("page.memoria.cancel")}
          </Button>
        </div>
      ) : editando ? null : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            aria-label={t("page.memoria.edit", { clave: memoria.clave })}
            onClick={abrirEdicion}
          >
            <Pencil aria-hidden="true" />
            {t("page.memoria.editAction")}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            aria-label={t("page.memoria.delete", { clave: memoria.clave })}
            onClick={() => setPorBorrar(true)}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      )}

      {mensajeError === null ? null : (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {mensajeError}
        </p>
      )}
    </article>
  );
};

export const MemoriaPage = () => {
  const { t } = useI18n();
  const memorias = useMemorias();

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b border-border pb-5">
        <h1 className="font-heading text-display font-medium">{t("page.memoria.title")}</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {t("page.memoria.description")}
        </p>
      </header>

      {memorias.isPending ? (
        <section
          aria-busy="true"
          className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet"
        >
          <p role="status" className="text-sm text-muted-foreground">
            {t("page.memoria.loading")}
          </p>
        </section>
      ) : null}

      {memorias.isError ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <h2 className="font-heading text-xl font-medium">{t("page.memoria.loadError")}</h2>
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            {memorias.error instanceof ApiError ? memorias.error.mensaje : t("error.genericError")}
          </p>
          <Button variant="outline" className="mt-6" onClick={() => void memorias.refetch()}>
            {t("page.memoria.retry")}
          </Button>
        </section>
      ) : null}

      {memorias.isSuccess && memorias.data.memorias.length === 0 ? (
        <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
          <Brain aria-hidden="true" className="size-6 text-primary" strokeWidth={1.5} />
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            {t("page.memoria.empty")}
          </p>
        </section>
      ) : null}

      {memorias.isSuccess && memorias.data.memorias.length > 0 ? (
        <ul aria-label={t("page.memoria.listLabel")} className="flex flex-col gap-3">
          {memorias.data.memorias.map((memoria) => (
            <li key={memoria.id}>
              <FichaMemoria memoria={memoria} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
