import {
  type Accion,
  type Conversacion,
  type EstadoAccion,
  LIMITE_MENSAJE_CHAT,
} from "@migite/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { History, MessageSquare, Plus, Send, Trash2, TriangleAlert } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { ApiError } from "@/api/api";
import {
  useAccionesPendientes,
  useBorrarConversacion,
  useConfirmarAccion,
  useConversaciones,
  useMensajesConversacion,
  useRechazarAccion,
} from "@/api/hooks";
import { queryKeys } from "@/api/keys";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import type { AppTranslationKey } from "@/i18n/translate";
import { aMensajeChat, type MensajeChat, resumirAccion, streamMensajeChat } from "@/lib/chat";
import { formatFecha } from "@/lib/fecha";
import { cn } from "@/lib/utils";

type PeticionChat = {
  readonly mensaje: string;
  readonly conversacionId?: string;
};

type HerramientaEnCurso = {
  readonly nombre: string;
  readonly isError: boolean;
};

const ETIQUETAS_ESTADO = {
  aplicada: "page.chat.action.applied",
  error: "page.chat.action.failed",
  pendiente: "page.chat.action.pending",
  rechazada: "page.chat.action.rejected",
} as const satisfies Record<EstadoAccion, AppTranslationKey>;

const ESTILOS_ESTADO: Record<EstadoAccion, string> = {
  aplicada: "border-primary/40 bg-primary/10 text-foreground",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  pendiente: "border-border bg-muted text-foreground",
  rechazada: "border-border bg-background text-muted-foreground",
};

type TarjetaAccionProps = {
  readonly accion: Accion;
};

const TarjetaAccion = ({ accion }: TarjetaAccionProps) => {
  const { t } = useI18n();
  const confirmar = useConfirmarAccion();
  const rechazar = useRechazarAccion();
  const estado: EstadoAccion =
    confirmar.data?.estado ?? (rechazar.isSuccess ? "rechazada" : accion.estado);
  const pendiente = estado === "pendiente";
  const fallo = confirmar.error ?? rechazar.error;
  const mensajeError =
    fallo instanceof ApiError
      ? fallo.mensaje
      : confirmar.isError
        ? t("page.chat.action.confirmError")
        : rechazar.isError
          ? t("page.chat.action.rejectError")
          : null;

  return (
    <article className="rounded-lg border border-border bg-card px-4 py-3.5 shadow-sheet">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-medium">{resumirAccion(accion, t)}</h3>
          {accion.detalle === undefined ? null : (
            <p className="mt-1 max-w-prose text-xs text-muted-foreground">{accion.detalle}</p>
          )}
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-xs font-medium",
            ESTILOS_ESTADO[estado],
          )}
        >
          {t(ETIQUETAS_ESTADO[estado])}
        </span>
      </div>
      {pendiente ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => confirmar.mutate(accion.id)}
            disabled={confirmar.isPending || rechazar.isPending}
          >
            {confirmar.isPending ? t("page.chat.action.confirming") : t("page.chat.action.confirm")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => rechazar.mutate(accion.id)}
            disabled={confirmar.isPending || rechazar.isPending}
          >
            {rechazar.isPending ? t("page.chat.action.rejecting") : t("page.chat.action.reject")}
          </Button>
        </div>
      ) : null}
      {mensajeError === null ? null : (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {mensajeError}
        </p>
      )}
    </article>
  );
};

export const ChatPage = () => {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const pendientes = useAccionesPendientes();
  const conversaciones = useConversaciones();
  const borrarConversacion = useBorrarConversacion();
  const [acciones, setAcciones] = useState<readonly Accion[]>([]);
  const [conversacionId, setConversacionId] = useState<string | undefined>(undefined);
  const [idCargado, setIdCargado] = useState<string | undefined>(undefined);
  const [mensajes, setMensajes] = useState<readonly MensajeChat[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [herramienta, setHerramienta] = useState<HerramientaEnCurso | null>(null);
  const [errorStream, setErrorStream] = useState<string | null>(null);
  const [avisoLimite, setAvisoLimite] = useState(false);
  const [ultimoEnvio, setUltimoEnvio] = useState<PeticionChat | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(true);
  const [porBorrar, setPorBorrar] = useState<string | null>(null);
  const secuencia = useRef(0);
  const idPropuestas = useId();
  const idConversaciones = useId();
  const accionesServidor = pendientes.data?.acciones;
  const mensajesServidor = useMensajesConversacion(idCargado);
  const cargandoConversacion = idCargado !== undefined && mensajesServidor.isFetching;
  const totalConversaciones = conversaciones.data?.conversaciones.length ?? 0;

  useEffect(() => {
    if (accionesServidor !== undefined) {
      setAcciones(accionesServidor);
    }
  }, [accionesServidor]);

  useEffect(() => {
    if (idCargado === undefined || mensajesServidor.data === undefined) {
      return;
    }
    setMensajes(mensajesServidor.data.mensajes.map(aMensajeChat));
  }, [idCargado, mensajesServidor.data]);

  const siguienteId = (): string => {
    secuencia.current += 1;
    return `mensaje-${secuencia.current}`;
  };

  const reiniciarConversacion = (): void => {
    setConversacionId(undefined);
    setIdCargado(undefined);
    setMensajes([]);
    setErrorStream(null);
    setUltimoEnvio(null);
    setAvisoLimite(false);
    setHerramienta(null);
    setPorBorrar(null);
  };

  const abrirConversacion = (conversacion: Conversacion): void => {
    if (enviando || conversacion.id === idCargado) {
      return;
    }
    setConversacionId(conversacion.id);
    setIdCargado(conversacion.id);
    setMensajes([]);
    setErrorStream(null);
    setUltimoEnvio(null);
    setAvisoLimite(false);
    setHerramienta(null);
    setPorBorrar(null);
  };

  const confirmarBorrado = (id: string): void => {
    borrarConversacion.mutate(id, {
      onSuccess: () => {
        setPorBorrar(null);
        if (id === conversacionId || id === idCargado) {
          reiniciarConversacion();
        }
      },
    });
  };

  const ejecutar = async (peticion: PeticionChat, idAsistente: string): Promise<void> => {
    setEnviando(true);
    setHerramienta(null);
    setErrorStream(null);
    setAvisoLimite(false);
    try {
      await streamMensajeChat({
        mensaje: peticion.mensaje,
        ...(peticion.conversacionId === undefined
          ? {}
          : { conversacionId: peticion.conversacionId }),
        locale,
        onEvento: (evento) => {
          switch (evento.tipo) {
            case "delta":
              setHerramienta(null);
              setMensajes((previos) =>
                previos.map((mensaje) =>
                  mensaje.id === idAsistente
                    ? { ...mensaje, contenido: mensaje.contenido + evento.texto }
                    : mensaje,
                ),
              );
              break;
            case "herramienta":
              setHerramienta({ nombre: evento.nombre, isError: evento.isError });
              break;
            case "fin":
              setHerramienta(null);
              setMensajes((previos) =>
                previos.map((mensaje) =>
                  mensaje.id === idAsistente
                    ? { ...mensaje, contenido: evento.contenido }
                    : mensaje,
                ),
              );
              setAcciones(evento.accionesPropuestas);
              setAvisoLimite(evento.estado === "limite");
              if (evento.conversacionId !== undefined) {
                setConversacionId(evento.conversacionId);
                void queryClient.invalidateQueries({ queryKey: queryKeys.conversaciones });
              }
              break;
            case "error":
              setHerramienta(null);
              setErrorStream(evento.mensaje);
              break;
          }
        },
      });
    } catch (error) {
      setErrorStream(error instanceof ApiError ? error.mensaje : t("page.chat.streamError"));
    } finally {
      setEnviando(false);
      setHerramienta(null);
    }
  };

  const enviar = (textoBruto: string): void => {
    const limpio = textoBruto.trim();
    if (limpio === "" || enviando || cargandoConversacion) {
      return;
    }
    const idUsuario = siguienteId();
    const idAsistente = siguienteId();
    setMensajes((previos) => [
      ...previos,
      { id: idUsuario, rol: "user", contenido: limpio },
      { id: idAsistente, rol: "assistant", contenido: "" },
    ]);
    setTexto("");
    const peticion: PeticionChat = {
      mensaje: limpio,
      ...(conversacionId === undefined ? {} : { conversacionId }),
    };
    setUltimoEnvio(peticion);
    void ejecutar(peticion, idAsistente);
  };

  const reintentar = (): void => {
    if (ultimoEnvio === null || enviando || cargandoConversacion) {
      return;
    }
    const peticion: PeticionChat = {
      mensaje: ultimoEnvio.mensaje,
      ...(conversacionId === undefined ? {} : { conversacionId }),
    };
    setUltimoEnvio(peticion);
    const idAsistente = siguienteId();
    setMensajes((previos) => {
      const ultimo = previos[previos.length - 1];
      const vacio = ultimo?.rol === "assistant" && ultimo.contenido.trim() === "";
      const base = vacio ? previos.slice(0, -1) : previos;
      return [...base, { id: idAsistente, rol: "assistant", contenido: "" }];
    });
    void ejecutar(peticion, idAsistente);
  };

  const manejarTecla = (evento: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (evento.key === "Enter" && !evento.shiftKey && !evento.nativeEvent.isComposing) {
      evento.preventDefault();
      enviar(texto);
    }
  };

  const bloqueado = enviando || cargandoConversacion;

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b border-border pb-5">
        <h1 className="font-heading text-display font-medium">{t("page.chat.title")}</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {t("page.chat.description")}
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          aria-expanded={panelAbierto}
          aria-controls={idConversaciones}
          onClick={() => setPanelAbierto((abierto) => !abierto)}
        >
          <History aria-hidden="true" />
          {t("page.chat.conversations.toggle", { total: totalConversaciones })}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={reiniciarConversacion}
          disabled={bloqueado}
        >
          <Plus aria-hidden="true" />
          {t("page.chat.conversations.new")}
        </Button>
      </div>

      {panelAbierto ? (
        <section
          id={idConversaciones}
          aria-label={t("page.chat.conversations.title")}
          className="rounded-lg border border-border bg-card p-3 shadow-sheet"
        >
          {conversaciones.isPending ? (
            <p className="text-sm text-muted-foreground">{t("page.chat.conversations.loading")}</p>
          ) : null}
          {conversaciones.isError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
            >
              <span className="font-medium">{t("page.chat.conversations.loadError")}. </span>
              {conversaciones.error instanceof ApiError
                ? conversaciones.error.mensaje
                : t("error.genericError")}
            </div>
          ) : null}
          {borrarConversacion.isError ? (
            <div
              role="alert"
              className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
            >
              <span className="font-medium">{t("page.chat.conversations.deleteError")}. </span>
              {borrarConversacion.error instanceof ApiError
                ? borrarConversacion.error.mensaje
                : t("error.genericError")}
            </div>
          ) : null}
          {conversaciones.data !== undefined && totalConversaciones === 0 ? (
            <p className="text-sm text-muted-foreground">{t("page.chat.conversations.empty")}</p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {(conversaciones.data?.conversaciones ?? []).map((conversacion) => {
              const activa = conversacion.id === conversacionId;
              return (
                <li
                  key={conversacion.id}
                  className={cn(
                    "flex items-stretch justify-between gap-1 rounded-md border",
                    activa ? "border-primary/40 bg-primary/5" : "border-border bg-background",
                  )}
                >
                  <button
                    type="button"
                    aria-current={activa ? "true" : undefined}
                    aria-label={conversacion.titulo}
                    onClick={() => abrirConversacion(conversacion)}
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="w-full truncate text-sm font-medium">
                      {conversacion.titulo}
                    </span>
                    <time dateTime={conversacion.creada} className="text-xs text-muted-foreground">
                      {formatFecha(conversacion.creada, locale, { dateStyle: "medium" })}
                    </time>
                  </button>
                  {porBorrar === conversacion.id ? (
                    <div className="flex items-center gap-1 px-2">
                      <span className="max-w-40 text-xs text-muted-foreground">
                        {t("page.chat.conversations.deleteConfirm")}
                      </span>
                      <Button
                        type="button"
                        size="xs"
                        variant="destructive"
                        onClick={() => confirmarBorrado(conversacion.id)}
                        disabled={borrarConversacion.isPending}
                      >
                        {t("page.chat.conversations.deleteYes")}
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => setPorBorrar(null)}
                        disabled={borrarConversacion.isPending}
                      >
                        {t("page.chat.conversations.deleteCancel")}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="m-1.5 shrink-0 self-center"
                      aria-label={t("page.chat.conversations.delete", {
                        titulo: conversacion.titulo,
                      })}
                      onClick={() => setPorBorrar(conversacion.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {acciones.length > 0 || pendientes.isError ? (
        <section aria-labelledby={idPropuestas} className="flex flex-col gap-3">
          <h2 id={idPropuestas} className="font-heading text-xl font-medium">
            {t("page.chat.actions.title")}
          </h2>
          {pendientes.isError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
            >
              <span className="font-medium">{t("page.chat.actions.loadError")}. </span>
              {pendientes.error instanceof ApiError
                ? pendientes.error.mensaje
                : t("error.genericError")}
            </div>
          ) : null}
          <ul className="flex flex-col gap-3">
            {acciones.map((accion) => (
              <li key={accion.id}>
                <TarjetaAccion accion={accion} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-busy={enviando} className="flex flex-col gap-3">
        {mensajes.length === 0 ? (
          cargandoConversacion ? (
            <p className="text-sm text-muted-foreground">
              {t("page.chat.conversations.messagesLoading")}
            </p>
          ) : (
            <div className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
              <MessageSquare aria-hidden="true" className="size-6 text-primary" strokeWidth={1.5} />
              <p className="mt-3 max-w-prose text-sm text-muted-foreground">
                {t("page.chat.empty")}
              </p>
            </div>
          )
        ) : (
          <ol className="flex flex-col gap-4">
            {mensajes.map((mensaje) => (
              <li
                key={mensaje.id}
                className={cn(
                  "flex flex-col gap-1",
                  mensaje.rol === "user" ? "items-end" : "items-start",
                )}
              >
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {mensaje.rol === "user" ? t("page.chat.roleUser") : t("page.chat.roleAssistant")}
                </p>
                <div
                  className={cn(
                    "max-w-prose rounded-lg border px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sheet",
                    mensaje.rol === "user"
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-card",
                  )}
                >
                  {mensaje.contenido}
                </div>
              </li>
            ))}
          </ol>
        )}

        {idCargado !== undefined && mensajesServidor.isError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
          >
            <span>
              <span className="font-medium">{t("page.chat.conversations.messagesError")}. </span>
              {mensajesServidor.error instanceof ApiError
                ? mensajesServidor.error.mensaje
                : t("error.genericError")}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void mensajesServidor.refetch()}
            >
              {t("page.chat.retry")}
            </Button>
          </div>
        ) : null}

        {herramienta === null ? null : (
          <p role="status" className="text-xs text-muted-foreground">
            {herramienta.isError
              ? t("page.chat.toolError", { nombre: herramienta.nombre })
              : t("page.chat.toolUsing", { nombre: herramienta.nombre })}
          </p>
        )}

        {avisoLimite ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t("page.chat.limitNotice")}
          </p>
        ) : null}

        {errorStream === null ? null : (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
          >
            <span className="inline-flex items-center gap-1.5">
              <TriangleAlert aria-hidden="true" className="size-4" />
              {errorStream}
            </span>
            {ultimoEnvio === null ? null : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={reintentar}
                disabled={bloqueado}
              >
                {t("page.chat.retry")}
              </Button>
            )}
          </div>
        )}
      </section>

      <form
        className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sheet"
        onSubmit={(evento) => {
          evento.preventDefault();
          enviar(texto);
        }}
      >
        <label htmlFor="chat-mensaje" className="sr-only">
          {t("page.chat.inputLabel")}
        </label>
        <textarea
          id="chat-mensaje"
          rows={3}
          value={texto}
          maxLength={LIMITE_MENSAJE_CHAT}
          disabled={bloqueado}
          placeholder={t("page.chat.inputPlaceholder")}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={manejarTecla}
          className="min-h-20 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={bloqueado || texto.trim() === ""}>
            <Send aria-hidden="true" />
            {enviando ? t("page.chat.sending") : t("page.chat.send")}
          </Button>
        </div>
      </form>
    </div>
  );
};
