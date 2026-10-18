import { getConnInfo } from "@hono/node-server/conninfo";
import {
  type ChatStreamEvent,
  chatMensajeBodySchema,
  chatStreamEventSchema,
} from "@migite/contracts";
import { defaultLocale, type Locale, t } from "@migite/core";
import { type IndexDatabase, listarMemorias } from "@migite/index";
import {
  type AgentLimits,
  type AgentRunState,
  type AgentStreamEvent,
  buildSystemPrompt,
  type ChatChunk,
  createAgentRuntime,
  describeError,
  type LLMClient,
} from "@migite/llm";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { crearRegistroDelAgente } from "../agent/registry.js";
import type { ServerEnv } from "../env.js";
import { resolveLocale } from "../middleware/errors.js";
import { listarAcciones } from "../services/acciones.js";
import {
  abrirConversacion,
  type ConversationsDeps,
  historialDeConversacion,
  registrarMensaje,
} from "../services/conversations.js";

const CHAT_MAX_TOKENS = 1024;
const MAX_HERRAMIENTAS_POR_PASO = 8;
const MAX_MENSAJES_POR_MINUTO = 20;
const VENTANA_RATE_LIMIT_MS = 60_000;

export type ChatRateLimitOptions = {
  readonly maxMensajes?: number;
  readonly ventanaMs?: number;
};

export type ChatDeps = {
  readonly client: LLMClient;
  readonly db: IndexDatabase;
  readonly vaultDir: string;
  readonly timeZone?: string;
  readonly locale?: Locale;
  readonly rateLimit?: ChatRateLimitOptions;
  readonly limits?: AgentLimits;
};

type RegistroMensajes = {
  mensajes: number;
  expiraEn: number;
};

const createRateLimiter = (options: ChatRateLimitOptions = {}) => {
  const maxMensajes = options.maxMensajes ?? MAX_MENSAJES_POR_MINUTO;
  const ventanaMs = options.ventanaMs ?? VENTANA_RATE_LIMIT_MS;
  const registros = new Map<string, RegistroMensajes>();

  const vigente = (ip: string, ahora: number): RegistroMensajes | undefined => {
    const registro = registros.get(ip);
    if (registro === undefined) {
      return undefined;
    }
    if (registro.expiraEn <= ahora) {
      registros.delete(ip);
      return undefined;
    }
    return registro;
  };

  return {
    permitir: (ip: string): boolean => {
      const ahora = Date.now();
      const registro = vigente(ip, ahora);
      if (registro === undefined) {
        registros.set(ip, { mensajes: 1, expiraEn: ahora + ventanaMs });
        return true;
      }
      if (registro.mensajes >= maxMensajes) {
        return false;
      }
      registro.mensajes += 1;
      return true;
    },
  };
};

const clientIp = (c: Context<ServerEnv>): string => {
  try {
    return getConnInfo(c).remote.address ?? "local";
  } catch {
    return "local";
  }
};

let deps: ChatDeps | undefined;
let limiter = createRateLimiter();

export const configureChat = (next: ChatDeps): void => {
  deps = next;
  limiter = createRateLimiter(next.rateLimit);
};

const currentDeps = (): ChatDeps => {
  if (deps === undefined) {
    throw new Error("el runtime de chat no está configurado");
  }
  return deps;
};

const readJson = async (c: Context<ServerEnv>): Promise<unknown> => {
  try {
    return await c.req.json();
  } catch {
    throw new HTTPException(400);
  }
};

const toWireEvent = (event: AgentStreamEvent): ChatStreamEvent | undefined => {
  if (event.type === "delta") {
    return { tipo: "delta", texto: event.texto };
  }
  if (event.type === "toolEnd") {
    return { tipo: "herramienta", nombre: event.name, isError: event.isError };
  }
  return undefined;
};

const limitarToolCalls = async function* (
  source: AsyncIterable<ChatChunk>,
): AsyncGenerator<ChatChunk> {
  for await (const chunk of source) {
    if (chunk.toolCallDeltas === undefined) {
      yield chunk;
      continue;
    }
    const toolCallDeltas = chunk.toolCallDeltas.filter(
      (delta) => delta.index < MAX_HERRAMIENTAS_POR_PASO,
    );
    yield { ...chunk, toolCallDeltas };
  }
};

const conTopeDeHerramientas = (client: LLMClient): LLMClient => ({
  chat: (role, request) => client.chat(role, request),
  embed: (role, texts) => client.embed(role, texts),
  chatStream: (role, request) => limitarToolCalls(client.chatStream(role, request)),
});

export const chatRouter = new Hono<ServerEnv>();

chatRouter.post("/mensajes", async (c) => {
  const body = chatMensajeBodySchema.parse(await readJson(c));
  const actual = currentDeps();
  const locale = resolveLocale(c.req.header("accept-language"), actual.locale ?? defaultLocale);
  if (!limiter.permitir(clientIp(c))) {
    return c.json(
      {
        error: {
          codigo: "rate_limited",
          mensaje: t("error.rateLimited", undefined, locale),
        },
      },
      429,
    );
  }

  const conversations: ConversationsDeps = { db: actual.db };
  const existente =
    body.conversacionId === undefined
      ? undefined
      : abrirConversacion(conversations, body.conversacionId);
  const history =
    existente === undefined
      ? []
      : historialDeConversacion(conversations, existente.id).map((mensaje) => ({
          role: mensaje.rol,
          content: mensaje.contenido,
        }));
  const accionesDeps = {
    db: actual.db,
    vaultDir: actual.vaultDir,
    ...(actual.timeZone === undefined ? {} : { timeZone: actual.timeZone }),
  };
  const registry = crearRegistroDelAgente(accionesDeps);
  const runtime = createAgentRuntime({
    client: conTopeDeHerramientas(actual.client),
    registry,
    ...(actual.limits === undefined ? {} : { limits: actual.limits }),
  });

  return streamSSE(c, async (stream) => {
    const write = (event: ChatStreamEvent): Promise<void> =>
      stream.writeSSE({ data: JSON.stringify(event) });
    const run = runtime.runStream({
      systemPrompt: buildSystemPrompt({ locale, memorias: listarMemorias(actual.db) }),
      history,
      userMessage: body.mensaje,
      options: { maxTokens: CHAT_MAX_TOKENS },
    });
    const iterator = run[Symbol.asyncIterator]();
    let conversacionId = existente?.id;

    const asegurarConversacion = (): string => {
      if (conversacionId === undefined) {
        conversacionId = abrirConversacion(conversations, undefined).id;
      }
      return conversacionId;
    };

    const persistirTurno = (persistirUsuario: boolean, contenidoAsistente: string): void => {
      const id = asegurarConversacion();
      if (persistirUsuario) {
        registrarMensaje(conversations, {
          conversacionId: id,
          rol: "user",
          contenido: body.mensaje,
        });
      }
      if (contenidoAsistente.trim().length > 0) {
        registrarMensaje(conversations, {
          conversacionId: id,
          rol: "assistant",
          contenido: contenidoAsistente,
        });
      }
    };

    const escribirFin = (contenido: string, pasos: number, estado: AgentRunState): Promise<void> =>
      write(
        chatStreamEventSchema.parse({
          tipo: "fin",
          contenido,
          pasos,
          estado,
          conversacionId: asegurarConversacion(),
          accionesPropuestas: listarAcciones(accionesDeps, "pendiente"),
        }),
      );

    try {
      let step = await iterator.next();
      while (!step.done) {
        const event = toWireEvent(step.value);
        if (event !== undefined) {
          await write(chatStreamEventSchema.parse(event));
        }
        step = await iterator.next();
      }

      const result = step.value;
      if (result.estado === "error") {
        const parcial = result.content.trim().length > 0;
        if (parcial) {
          persistirTurno(false, result.content);
        }
        await write(
          chatStreamEventSchema.parse({
            tipo: "error",
            mensaje: result.error ?? t("error.internalError", undefined, locale),
          }),
        );
        if (parcial) {
          await escribirFin(result.content, result.steps, "error");
        }
        return;
      }

      persistirTurno(true, result.content);
      await escribirFin(result.content, result.steps, result.estado);
    } catch (error) {
      await write(chatStreamEventSchema.parse({ tipo: "error", mensaje: describeError(error) }));
    }
  });
});
