import {
  type Accion,
  accionPropuestaSchema,
  type ChatHistorialMensaje,
  type ChatStreamEvent,
  chatStreamEventSchema,
  LIMITE_HISTORIAL_CHAT,
} from "@migite/contracts";
import type { Locale, TranslationParams } from "@migite/core";
import { ApiError, toApiError } from "@/api/api";
import type { AppTranslationKey } from "@/i18n/translate";
import { translate } from "@/i18n/translate";

export type RolMensaje = "user" | "assistant";

export type MensajeChat = {
  readonly id: string;
  readonly rol: RolMensaje;
  readonly contenido: string;
};

export const construirHistorial = (mensajes: readonly MensajeChat[]): ChatHistorialMensaje[] =>
  mensajes
    .slice(-LIMITE_HISTORIAL_CHAT)
    .map((mensaje) => ({ role: mensaje.rol, content: mensaje.contenido }));

type Traductor = (clave: AppTranslationKey, params?: TranslationParams) => string;

export const resumirAccion = (accion: Accion, t: Traductor): string => {
  const propuesta = accionPropuestaSchema.safeParse(accion);
  if (!propuesta.success) {
    return t("page.chat.summary.unknown", { tipo: accion.tipoAccion });
  }
  const { payload, tipoAccion } = propuesta.data;
  switch (tipoAccion) {
    case "crear_objeto":
      return t("page.chat.summary.create", { titulo: payload.titulo });
    case "editar_objeto":
      return t("page.chat.summary.edit", { titulo: payload.cambios.titulo ?? payload.id });
    case "borrar_objeto":
      return t("page.chat.summary.delete", { titulo: payload.id });
  }
};

const PREFIJO_DATA = "data:";

const parsearLinea = (linea: string): ChatStreamEvent | undefined => {
  const limpia = linea.trim();
  if (!limpia.startsWith(PREFIJO_DATA)) {
    return undefined;
  }
  const payload = limpia.slice(PREFIJO_DATA.length).trim();
  if (payload === "") {
    return undefined;
  }
  try {
    const parsed = chatStreamEventSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export type OpcionesStreamChat = {
  readonly mensaje: string;
  readonly historial: readonly ChatHistorialMensaje[];
  readonly locale: Locale;
  readonly signal?: AbortSignal;
  readonly onEvento: (evento: ChatStreamEvent) => void;
};

export const streamMensajeChat = async (opciones: OpcionesStreamChat): Promise<void> => {
  const response = await fetch("/api/chat/mensajes", {
    method: "POST",
    credentials: "include",
    ...(opciones.signal === undefined ? {} : { signal: opciones.signal }),
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      "Accept-Language": opciones.locale,
    },
    body: JSON.stringify({
      mensaje: opciones.mensaje,
      ...(opciones.historial.length === 0 ? {} : { historial: opciones.historial }),
    }),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.body === null) {
    throw new ApiError(
      "internal_error",
      translate("error.genericError", undefined, opciones.locale),
      response.status,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const procesarLineas = (): void => {
    let salto = buffer.indexOf("\n");
    while (salto !== -1) {
      const linea = buffer.slice(0, salto);
      buffer = buffer.slice(salto + 1);
      const evento = parsearLinea(linea);
      if (evento !== undefined) {
        opciones.onEvento(evento);
      }
      salto = buffer.indexOf("\n");
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    procesarLineas();
  }

  buffer += decoder.decode();
  const ultimo = parsearLinea(buffer);
  if (ultimo !== undefined) {
    opciones.onEvento(ultimo);
  }
};
