import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ChatStreamEvent, chatStreamEventSchema } from "@migite/contracts";
import { bootstrapVault, isUlid } from "@migite/core";
import {
  actualizarEstadoAccion,
  crearAccion,
  type IndexHandle,
  listarConversaciones,
  listarMemorias,
  listarMensajes,
  openIndex,
} from "@migite/index";
import {
  type AgentLimits,
  type ChatChunk,
  type ChatResponse,
  type LLMClient,
  MockLLMClient,
  type ToolCall,
} from "@migite/llm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import {
  type AuthOptions,
  createSessionToken,
  createStaticSessionStore,
  SESSION_COOKIE,
} from "../auth.js";
import type { ServerEnv } from "../env.js";
import { configureAcciones } from "./acciones.js";
import { type ChatRateLimitOptions, configureChat } from "./chat.js";

const USUARIO = "ana";
const SECRETO = "secreto-de-test-suficientemente-largo";

const auth: AuthOptions = {
  store: createStaticSessionStore({
    usuario: USUARIO,
    passwordHash: "$argon2id$test",
    secretoSesion: SECRETO,
  }),
};

const toolCall = (name: string, args: Record<string, unknown>, id = `call-${name}`): ToolCall => ({
  id,
  name,
  arguments: args,
});

const toolTurn = (calls: readonly ToolCall[], content = ""): ChatResponse => ({
  message: { content, toolCalls: calls },
  finishReason: "tool_calls",
});

const finalTurn = (content: string): ChatResponse => ({
  message: { content, toolCalls: [] },
  finishReason: "stop",
});

type ErrorBody = {
  readonly error: { readonly codigo: string; readonly mensaje: string };
};

let root: string;
let vaultDir: string;
let handle: IndexHandle;
let app: Hono<ServerEnv>;
let token: string;

const headers = (): Record<string, string> => ({ cookie: `${SESSION_COOKIE}=${token}` });

const configure = (
  client: LLMClient,
  options: { readonly rateLimit?: ChatRateLimitOptions; readonly limits?: AgentLimits } = {},
): void => {
  configureChat({
    client,
    db: handle.db,
    vaultDir,
    locale: "es",
    ...(options.rateLimit === undefined ? {} : { rateLimit: options.rateLimit }),
    ...(options.limits === undefined ? {} : { limits: options.limits }),
  });
};

const postMensaje = (
  body: unknown,
  options: { readonly conSesion?: boolean; readonly acceptLanguage?: string } = {},
): Promise<Response> =>
  Promise.resolve(
    app.request("/api/chat/mensajes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.acceptLanguage === undefined
          ? {}
          : { "accept-language": options.acceptLanguage }),
        ...(options.conSesion === false ? {} : headers()),
      },
      body: JSON.stringify(body),
    }),
  );

type StreamBody = {
  readonly raw: string;
  readonly eventos: ChatStreamEvent[];
};

const readEventos = async (res: Response): Promise<StreamBody> => {
  const raw = await res.text();
  const eventos = raw
    .split("\n\n")
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => {
      expect(block.startsWith("data: ")).toBe(true);
      return chatStreamEventSchema.parse(JSON.parse(block.slice("data: ".length)));
    });
  return { raw, eventos };
};

const errorOf = async (res: Response): Promise<ErrorBody> => (await res.json()) as ErrorBody;

const conversacionIdDe = (eventos: readonly ChatStreamEvent[]): string => {
  const fin = eventos.at(-1);
  if (fin?.tipo !== "fin" || fin.conversacionId === undefined) {
    throw new Error("falta el evento de fin con conversacionId");
  }
  return fin.conversacionId;
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "migite-chat-api-"));
  vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  bootstrapVault(vaultDir);
  handle = openIndex({ dbPath: join(root, "index.db") });
  configureAcciones({ db: handle.db, vaultDir });
  token = createSessionToken({ usuario: USUARIO, generacion: 0, secret: SECRETO });
  app = createApp({ auth });
});

afterEach(() => {
  handle.close();
  rmSync(root, { recursive: true, force: true });
});

describe("POST /api/chat/mensajes", () => {
  it("requires a session", async () => {
    const res = await postMensaje({ mensaje: "hola" }, { conSesion: false });

    expect(res.status).toBe(401);
    expect((await errorOf(res)).error.codigo).toBe("unauthorized");
  });

  it("answers 400 as JSON when the body is invalid", async () => {
    for (const body of [{}, { mensaje: "" }, { mensaje: "hola", historial: [] }]) {
      const res = await postMensaje(body);

      expect(res.status).toBe(400);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect((await errorOf(res)).error.codigo).toBe("validation_error");
    }
  });

  it("streams delta, tool and fin with the pending proposals and the conversation id", async () => {
    const pendiente = crearAccion(handle.db, {
      tipoAccion: "crear_objeto",
      payload: { titulo: "Pendiente" },
    });
    const rechazada = crearAccion(handle.db, {
      tipoAccion: "crear_objeto",
      payload: { titulo: "Rechazada" },
    });
    actualizarEstadoAccion(handle.db, rechazada.id, { estado: "rechazada" });
    const client = new MockLLMClient({
      responses: [
        toolTurn([toolCall("listar_objetos", {})], "Consulto el vault."),
        finalTurn("No hay objetos."),
      ],
    });
    configure(client);

    const res = await postMensaje({ mensaje: "¿qué tengo?" });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-cache");

    const { raw, eventos } = await readEventos(res);
    expect(raw).not.toContain("[DONE]");
    expect(raw.endsWith("\n\n")).toBe(true);
    expect(eventos.map((evento) => evento.tipo)).toEqual(["delta", "herramienta", "delta", "fin"]);
    expect(eventos[0]).toEqual({ tipo: "delta", texto: "Consulto el vault." });
    expect(eventos[1]).toEqual({ tipo: "herramienta", nombre: "listar_objetos", isError: false });
    expect(eventos[2]).toEqual({ tipo: "delta", texto: "No hay objetos." });
    const fin = eventos[3];
    if (fin?.tipo !== "fin") {
      throw new Error("falta el evento de fin");
    }
    expect(fin.contenido).toBe("Consulto el vault.\n\nNo hay objetos.");
    expect(fin.pasos).toBe(2);
    expect(fin.estado).toBe("completado");
    expect(fin.accionesPropuestas.map((accion) => accion.id)).toEqual([pendiente.id]);
    expect(fin.accionesPropuestas[0]?.estado).toBe("pendiente");
    expect(fin.accionesPropuestas[0]?.tipoAccion).toBe("crear_objeto");
    expect(fin.conversacionId).toBeDefined();
    const conversacionId = conversacionIdDe(eventos);
    expect(isUlid(conversacionId)).toBe(true);

    const [conversacion] = listarConversaciones(handle.db);
    expect(conversacion?.id).toBe(conversacionId);
    expect(conversacion?.titulo).toBe("¿qué tengo?");
    expect(
      listarMensajes(handle.db, conversacionId).map((mensaje) => [mensaje.rol, mensaje.contenido]),
    ).toEqual([
      ["user", "¿qué tengo?"],
      ["assistant", "Consulto el vault.\n\nNo hay objetos."],
    ]);

    const first = client.calls[0];
    if (first === undefined || first.method !== "chatStream") {
      throw new Error("se esperaba una llamada de chatStream");
    }
    expect(first.request.messages[0]?.role).toBe("system");
    expect(first.request.messages[0]?.content).toContain("Migite");
    expect(first.request.messages.at(-1)).toEqual({ role: "user", content: "¿qué tengo?" });
  });

  it("reuses the persisted history when the conversation id is given", async () => {
    const client = new MockLLMClient({
      responses: [finalTurn("Hola"), finalTurn("Sigo")],
    });
    configure(client);

    const first = await postMensaje({ mensaje: "hola" });
    const conversacionId = conversacionIdDe((await readEventos(first)).eventos);

    const res = await postMensaje(
      { conversacionId, mensaje: "sigue" },
      { acceptLanguage: "en-GB,en;q=0.9" },
    );

    expect(res.status).toBe(200);
    const { eventos } = await readEventos(res);
    expect(eventos.at(-1)?.tipo).toBe("fin");
    expect(conversacionIdDe(eventos)).toBe(conversacionId);

    const call = client.calls[1];
    if (call === undefined || call.method !== "chatStream") {
      throw new Error("se esperaba una llamada de chatStream");
    }
    expect(call.request.messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
    expect(call.request.messages.slice(1)).toEqual([
      { role: "user", content: "hola" },
      { role: "assistant", content: "Hola" },
      { role: "user", content: "sigue" },
    ]);
    expect(call.request.messages[0]?.content).toContain("You are the Migite assistant");

    expect(
      listarMensajes(handle.db, conversacionId).map((mensaje) => [mensaje.rol, mensaje.contenido]),
    ).toEqual([
      ["user", "hola"],
      ["assistant", "Hola"],
      ["user", "sigue"],
      ["assistant", "Sigo"],
    ]);
    expect(listarConversaciones(handle.db)).toHaveLength(1);
  });

  it("answers 404 for an unknown conversation", async () => {
    const client = new MockLLMClient({ responses: [finalTurn("Hola")] });
    configure(client);

    const res = await postMensaje({
      conversacionId: "01JCONVERSACION0000000000000",
      mensaje: "hola",
    });

    expect(res.status).toBe(404);
    expect((await errorOf(res)).error.codigo).toBe("conversation_not_found");
    expect(client.calls).toHaveLength(0);
    expect(listarConversaciones(handle.db)).toEqual([]);
  });

  it("emits an error event when the run fails", async () => {
    const client = new MockLLMClient({ responses: [new Error("proveedor caído")] });
    configure(client);

    const res = await postMensaje({ mensaje: "hola" });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const { eventos } = await readEventos(res);
    expect(eventos).toEqual([{ tipo: "error", mensaje: "proveedor caído" }]);

    expect(listarConversaciones(handle.db)).toEqual([]);
  });

  it("no duplica el mensaje ni las propuestas al reintentar tras un error", async () => {
    const pendiente = crearAccion(handle.db, {
      tipoAccion: "crear_objeto",
      payload: { titulo: "Pendiente" },
    });
    const client = new MockLLMClient({
      responses: [finalTurn("Primera"), new Error("caído"), finalTurn("Segunda")],
    });
    configure(client);

    const primera = await postMensaje({ mensaje: "hola" });
    const conversacionId = conversacionIdDe((await readEventos(primera)).eventos);

    const fallida = await postMensaje({ conversacionId, mensaje: "sigue" });
    const { eventos: eventosFallidos } = await readEventos(fallida);
    expect(eventosFallidos).toEqual([{ tipo: "error", mensaje: "caído" }]);

    const reintento = await postMensaje({ conversacionId, mensaje: "sigue" });
    const { eventos: eventosReintento } = await readEventos(reintento);
    const fin = eventosReintento.at(-1);
    if (fin?.tipo !== "fin") {
      throw new Error("falta el evento de fin");
    }
    expect(fin.accionesPropuestas.map((accion) => accion.id)).toEqual([pendiente.id]);

    expect(
      listarMensajes(handle.db, conversacionId).map((mensaje) => [mensaje.rol, mensaje.contenido]),
    ).toEqual([
      ["user", "hola"],
      ["assistant", "Primera"],
      ["user", "sigue"],
      ["assistant", "Segunda"],
    ]);
  });

  it("persiste el parcial y lo devuelve en el fin cuando el stream agota el timeout", async () => {
    const client: LLMClient = {
      async chat(): Promise<ChatResponse> {
        throw new Error("no se esperaba una llamada de chat directo");
      },
      async *chatStream(): AsyncIterable<ChatChunk> {
        yield { contentDelta: "parcial mostrado" };
        await new Promise((resolver) => setTimeout(resolver, 50));
        yield { contentDelta: " y resto" };
        yield { finishReason: "stop" };
      },
      async embed(): Promise<number[][]> {
        return [];
      },
    };
    configure(client, { limits: { timeoutMs: 10 } });

    const res = await postMensaje({ mensaje: "date prisa" });

    expect(res.status).toBe(200);
    const { eventos } = await readEventos(res);
    expect(eventos.map((evento) => evento.tipo)).toEqual(["delta", "fin"]);
    const fin = eventos.at(-1);
    if (fin?.tipo !== "fin") {
      throw new Error("falta el evento de fin");
    }
    expect(fin.estado).toBe("limite");
    expect(fin.contenido).toBe("parcial mostrado");
    expect(
      listarMensajes(handle.db, conversacionIdDe(eventos)).map((mensaje) => [
        mensaje.rol,
        mensaje.contenido,
      ]),
    ).toEqual([
      ["user", "date prisa"],
      ["assistant", "parcial mostrado"],
    ]);
  });

  it("persiste el parcial mostrado si el stream falla a mitad", async () => {
    const client: LLMClient = {
      async chat(): Promise<ChatResponse> {
        throw new Error("no se esperaba una llamada de chat directo");
      },
      async *chatStream(): AsyncIterable<ChatChunk> {
        yield { contentDelta: "parcial" };
        throw new Error("conexión cortada");
      },
      async embed(): Promise<number[][]> {
        return [];
      },
    };
    configure(client);

    const res = await postMensaje({ mensaje: "hola" });

    expect(res.status).toBe(200);
    const { eventos } = await readEventos(res);
    expect(eventos.map((evento) => evento.tipo)).toEqual(["delta", "error"]);
    expect(eventos[1]).toEqual({ tipo: "error", mensaje: "conexión cortada" });

    const [conversacion] = listarConversaciones(handle.db);
    if (conversacion === undefined) {
      throw new Error("falta la conversación con el parcial");
    }
    expect(
      listarMensajes(handle.db, conversacion.id).map((mensaje) => [mensaje.rol, mensaje.contenido]),
    ).toEqual([["assistant", "parcial"]]);
  });

  it("propone recordar un dato y lo usa en el prompt siguiente tras confirmarlo", async () => {
    const client = new MockLLMClient({
      responses: [
        toolTurn([
          toolCall(
            "recordar_dato",
            { clave: "color favorito", contenido: "azul" },
            "call-recordar",
          ),
        ]),
        finalTurn("Lo recordaré cuando lo confirmes."),
        finalTurn("Tu color favorito es azul."),
      ],
    });
    configure(client);

    const primera = await postMensaje({ mensaje: "recuerda que mi color favorito es azul" });
    expect(primera.status).toBe(200);
    const { eventos } = await readEventos(primera);
    const fin = eventos.at(-1);
    if (fin?.tipo !== "fin") {
      throw new Error("falta el evento de fin");
    }
    const propuesta = fin.accionesPropuestas.find(
      (accion) => accion.tipoAccion === "guardar_memoria",
    );
    if (propuesta === undefined) {
      throw new Error("falta la propuesta de guardar memoria");
    }
    expect(propuesta.estado).toBe("pendiente");
    expect(listarMemorias(handle.db)).toEqual([]);

    const primerPrompt = client.calls[0];
    if (primerPrompt === undefined || primerPrompt.method !== "chatStream") {
      throw new Error("se esperaba una llamada de chatStream");
    }
    expect(primerPrompt.request.messages[0]?.content).not.toContain("Memoria aprobada");
    expect(primerPrompt.request.messages[0]?.content).not.toContain("azul");

    const confirmada = await app.request(`/api/acciones/${propuesta.id}/confirmar`, {
      method: "POST",
      headers: headers(),
    });
    expect(confirmada.status).toBe(200);
    expect(listarMemorias(handle.db).map((memoria) => [memoria.clave, memoria.contenido])).toEqual([
      ["color favorito", "azul"],
    ]);

    const segunda = await postMensaje({ mensaje: "¿cuál es mi color favorito?" });
    expect(segunda.status).toBe(200);
    const { eventos: eventosSegunda } = await readEventos(segunda);
    expect(eventosSegunda.at(-1)?.tipo).toBe("fin");

    const segundoPrompt = client.calls[2];
    if (segundoPrompt === undefined || segundoPrompt.method !== "chatStream") {
      throw new Error("se esperaba una llamada de chatStream");
    }
    expect(segundoPrompt.request.messages[0]?.content).toContain(
      "Memoria aprobada por la persona usuaria:",
    );
    expect(segundoPrompt.request.messages[0]?.content).toContain("- color favorito: azul");
  });

  it("aplica un tope de tokens a cada llamada del agente", async () => {
    const client = new MockLLMClient({ responses: [finalTurn("Hola")] });
    configure(client);

    const res = await postMensaje({ mensaje: "hola" });

    expect(res.status).toBe(200);
    const call = client.calls[0];
    if (call === undefined || call.method !== "chatStream") {
      throw new Error("se esperaba una llamada de chatStream");
    }
    expect(call.request.options).toEqual({ maxTokens: 1024 });
  });

  it("limita a 8 las tool calls ejecutadas en un mismo paso", async () => {
    const calls = Array.from({ length: 9 }, (_, index) =>
      toolCall("listar_objetos", {}, `call-${index}`),
    );
    const client = new MockLLMClient({ responses: [toolTurn(calls), finalTurn("Hecho")] });
    configure(client);

    const res = await postMensaje({ mensaje: "lista todo" });

    expect(res.status).toBe(200);
    const { eventos } = await readEventos(res);
    expect(eventos.filter((evento) => evento.tipo === "herramienta")).toHaveLength(8);
    expect(eventos.at(-1)?.tipo).toBe("fin");
    expect(client.calls.filter((call) => call.method === "chatStream")).toHaveLength(2);
  });

  it("answers 429 rate_limited when the session ip exceeds the message budget", async () => {
    const client = new MockLLMClient({ responses: [finalTurn("Uno"), finalTurn("Dos")] });
    configure(client, { rateLimit: { maxMensajes: 2, ventanaMs: 60_000 } });

    const primera = await postMensaje({ mensaje: "uno" });
    const segunda = await postMensaje({ mensaje: "dos" });
    const bloqueada = await postMensaje({ mensaje: "tres" });

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(bloqueada.status).toBe(429);
    expect((await errorOf(bloqueada)).error.codigo).toBe("rate_limited");
    expect(client.calls).toHaveLength(2);
  });
});
