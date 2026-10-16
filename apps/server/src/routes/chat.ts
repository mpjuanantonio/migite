import {
  type ChatStreamEvent,
  chatMensajeBodySchema,
  chatStreamEventSchema,
} from "@migite/contracts";
import { defaultLocale, type Locale, t } from "@migite/core";
import type { IndexDatabase } from "@migite/index";
import {
  type AgentStreamEvent,
  buildSystemPrompt,
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

export type ChatDeps = {
  readonly client: LLMClient;
  readonly db: IndexDatabase;
  readonly vaultDir: string;
  readonly timeZone?: string;
  readonly locale?: Locale;
};

let deps: ChatDeps | undefined;

export const configureChat = (next: ChatDeps): void => {
  deps = next;
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

export const chatRouter = new Hono<ServerEnv>();

chatRouter.post("/mensajes", async (c) => {
  const body = chatMensajeBodySchema.parse(await readJson(c));
  const actual = currentDeps();
  const locale = resolveLocale(c.req.header("accept-language"), actual.locale ?? defaultLocale);
  const registry = crearRegistroDelAgente({
    db: actual.db,
    vaultDir: actual.vaultDir,
    ...(actual.timeZone === undefined ? {} : { timeZone: actual.timeZone }),
  });
  const runtime = createAgentRuntime({ client: actual.client, registry });
  const history = (body.historial ?? []).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  return streamSSE(c, async (stream) => {
    const write = (event: ChatStreamEvent): Promise<void> =>
      stream.writeSSE({ data: JSON.stringify(event) });
    const run = runtime.runStream({
      systemPrompt: buildSystemPrompt({ locale }),
      history,
      userMessage: body.mensaje,
    });
    const iterator = run[Symbol.asyncIterator]();

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
        await write(
          chatStreamEventSchema.parse({
            tipo: "error",
            mensaje: result.error ?? t("error.internalError", undefined, locale),
          }),
        );
        return;
      }

      await write(
        chatStreamEventSchema.parse({
          tipo: "fin",
          contenido: result.content,
          pasos: result.steps,
          estado: result.estado,
          accionesPropuestas: listarAcciones(
            {
              db: actual.db,
              vaultDir: actual.vaultDir,
              ...(actual.timeZone === undefined ? {} : { timeZone: actual.timeZone }),
            },
            "pendiente",
          ),
        }),
      );
    } catch (error) {
      await write(chatStreamEventSchema.parse({ tipo: "error", mensaje: describeError(error) }));
    }
  });
});
