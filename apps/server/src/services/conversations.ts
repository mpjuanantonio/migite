import {
  type Conversacion,
  conversacionSchema,
  LIMITE_HISTORIAL_CHAT,
  type Mensaje,
  mensajeSchema,
} from "@migite/contracts";
import {
  borrarConversacion as borrarConversacionEnIndice,
  type ConversacionRecord,
  crearConversacion as crearConversacionEnIndice,
  guardarMensaje as guardarMensajeEnIndice,
  type IndexDatabase,
  listarConversaciones as listarConversacionesEnIndice,
  listarMensajes as listarMensajesEnIndice,
  type MensajeRecord,
  type MensajeRol,
  obtenerConversacion as obtenerConversacionEnIndice,
} from "@migite/index";

export type ConversationsDeps = {
  readonly db: IndexDatabase;
};

export type ConversationErrorCodigo = "conversation_not_found";

export class ConversationError extends Error {
  readonly codigo: ConversationErrorCodigo;

  constructor(codigo: ConversationErrorCodigo) {
    super(codigo);
    this.name = "ConversationError";
    this.codigo = codigo;
  }
}

export type RegistrarMensajeInput = {
  readonly conversacionId: string;
  readonly rol: MensajeRol;
  readonly contenido: string;
};

const toConversacion = (record: ConversacionRecord): Conversacion =>
  conversacionSchema.parse(record);

const toMensaje = (record: MensajeRecord): Mensaje => mensajeSchema.parse(record);

const conversacionExistente = (deps: ConversationsDeps, id: string): ConversacionRecord => {
  const record = obtenerConversacionEnIndice(deps.db, id);
  if (record === undefined) {
    throw new ConversationError("conversation_not_found");
  }
  return record;
};

export const abrirConversacion = (
  deps: ConversationsDeps,
  conversacionId?: string,
): Conversacion =>
  conversacionId === undefined
    ? toConversacion(crearConversacionEnIndice(deps.db, {}))
    : toConversacion(conversacionExistente(deps, conversacionId));

export const listarConversaciones = (deps: ConversationsDeps): Conversacion[] =>
  listarConversacionesEnIndice(deps.db).map(toConversacion);

export const listarMensajes = (deps: ConversationsDeps, conversacionId: string): Mensaje[] => {
  conversacionExistente(deps, conversacionId);
  return listarMensajesEnIndice(deps.db, conversacionId).map(toMensaje);
};

export const historialDeConversacion = (
  deps: ConversationsDeps,
  conversacionId: string,
): Mensaje[] =>
  listarMensajesEnIndice(deps.db, conversacionId).map(toMensaje).slice(-LIMITE_HISTORIAL_CHAT);

export const registrarMensaje = (deps: ConversationsDeps, input: RegistrarMensajeInput): Mensaje =>
  toMensaje(guardarMensajeEnIndice(deps.db, input));

export const borrarConversacion = (deps: ConversationsDeps, conversacionId: string): void => {
  if (!borrarConversacionEnIndice(deps.db, conversacionId)) {
    throw new ConversationError("conversation_not_found");
  }
};
