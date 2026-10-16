import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MockLLMClient } from "./mock.js";
import { createAgentRuntime, DEFAULT_AGENT_LIMITS } from "./runtime.js";
import { ToolRegistry } from "./tools.js";
import type { ChatRequest, ChatResponse, ChatUsage, ToolCall } from "./types.js";

const toolCall = (name: string, args: Record<string, unknown>, id = `call-${name}`): ToolCall => ({
  id,
  name,
  arguments: args,
});

const toolTurn = (calls: readonly ToolCall[], content = ""): ChatResponse => ({
  message: { content, toolCalls: calls },
  finishReason: "tool_calls",
});

const finalTurn = (content: string, usage?: ChatUsage): ChatResponse => ({
  message: { content, toolCalls: [] },
  finishReason: "stop",
  ...(usage === undefined ? {} : { usage }),
});

const createRegistry = (executed: string[]): ToolRegistry => {
  const registry = new ToolRegistry();
  registry.registerTool({
    name: "leer_objeto",
    description: "lee un objeto del vault",
    schema: z.object({ id: z.string().min(1) }),
    handler: ({ id }) => {
      executed.push(id);
      return `contenido de ${id}`;
    },
  });
  return registry;
};

const chatRequestAt = (client: MockLLMClient, index: number): ChatRequest => {
  const call = client.calls[index];
  if (call === undefined || call.method !== "chat") {
    throw new Error(`no hay llamada de chat en la posición ${index}`);
  }
  return call.request;
};

describe("createAgentRuntime", () => {
  it("ejecuta el ciclo tool-call y cierra con la respuesta final", async () => {
    const executed: string[] = [];
    const client = new MockLLMClient({
      responses: [toolTurn([toolCall("leer_objeto", { id: "n1" })]), finalTurn("Listo")],
    });
    const runtime = createAgentRuntime({ client, registry: createRegistry(executed) });

    const result = await runtime.run({ history: [], userMessage: "lee n1" });

    expect(result.estado).toBe("completado");
    expect(result.content).toBe("Listo");
    expect(result.steps).toBe(2);
    expect(result.finishReason).toBe("stop");
    expect(result.error).toBeUndefined();
    expect(executed).toEqual(["n1"]);
    expect(result.toolCallsEjecutados).toEqual([toolCall("leer_objeto", { id: "n1" })]);
    expect(result.events).toEqual([
      { type: "toolStart", toolCallId: "call-leer_objeto", name: "leer_objeto" },
      { type: "toolEnd", toolCallId: "call-leer_objeto", name: "leer_objeto", isError: false },
    ]);

    const first = chatRequestAt(client, 0);
    expect(first.messages).toEqual([{ role: "user", content: "lee n1" }]);
    expect(first.tools).toEqual([
      {
        name: "leer_objeto",
        description: "lee un objeto del vault",
        parameters: expect.objectContaining({ type: "object" }),
      },
    ]);

    const second = chatRequestAt(client, 1);
    expect(second.messages.at(-2)).toMatchObject({
      role: "assistant",
      toolCalls: [toolCall("leer_objeto", { id: "n1" })],
    });
    expect(second.messages.at(-1)).toEqual({
      role: "tool",
      content: "contenido de n1",
      toolCallId: "call-leer_objeto",
      name: "leer_objeto",
    });
  });

  it("ejecuta varias herramientas en un mismo turno en orden", async () => {
    const executed: string[] = [];
    const calls = [
      toolCall("leer_objeto", { id: "n1" }, "call-1"),
      toolCall("leer_objeto", { id: "n2" }, "call-2"),
    ];
    const client = new MockLLMClient({
      responses: [toolTurn(calls), finalTurn("Fin")],
    });
    const runtime = createAgentRuntime({ client, registry: createRegistry(executed) });

    const result = await runtime.run({ history: [], userMessage: "lee dos" });

    expect(executed).toEqual(["n1", "n2"]);
    expect(result.toolCallsEjecutados).toHaveLength(2);
    expect(result.events).toHaveLength(4);

    const toolMessages = chatRequestAt(client, 1).messages.filter(
      (message) => message.role === "tool",
    );
    expect(toolMessages.map((message) => message.toolCallId)).toEqual(["call-1", "call-2"]);
  });

  it("devuelve al modelo un error legible por argumentos inválidos y continúa", async () => {
    const executed: string[] = [];
    const client = new MockLLMClient({
      responses: [toolTurn([toolCall("leer_objeto", { id: 7 })]), finalTurn("Corregido")],
    });
    const runtime = createAgentRuntime({ client, registry: createRegistry(executed) });

    const result = await runtime.run({ history: [], userMessage: "lee mal" });

    expect(result.estado).toBe("completado");
    expect(executed).toEqual([]);
    const toolMessage = chatRequestAt(client, 1).messages.at(-1);
    expect(toolMessage?.role).toBe("tool");
    expect(toolMessage?.content).toMatch(/argumentos inválidos/);
    expect(result.events.at(1)).toEqual({
      type: "toolEnd",
      toolCallId: "call-leer_objeto",
      name: "leer_objeto",
      isError: true,
    });
  });

  it("devuelve un error por herramienta desconocida y continúa", async () => {
    const client = new MockLLMClient({
      responses: [toolTurn([toolCall("no_existe", {})]), finalTurn("Sigo")],
    });
    const runtime = createAgentRuntime({ client, registry: new ToolRegistry() });

    const result = await runtime.run({ history: [], userMessage: "usa algo raro" });

    expect(result.estado).toBe("completado");
    expect(chatRequestAt(client, 1).messages.at(-1)?.content).toBe(
      'herramienta desconocida: "no_existe"',
    );
  });

  it("siembra el error de una herramienta que falla y el ciclo continúa", async () => {
    const registry = new ToolRegistry();
    registry.registerTool({
      name: "romper",
      description: "siempre falla",
      schema: z.object({}),
      handler: () => {
        throw new Error("fuente rota");
      },
    });
    const client = new MockLLMClient({
      responses: [toolTurn([toolCall("romper", {})]), finalTurn("Recuperado")],
    });
    const runtime = createAgentRuntime({ client, registry });

    const result = await runtime.run({ history: [], userMessage: "rompe" });

    expect(result.estado).toBe("completado");
    expect(result.content).toBe("Recuperado");
    expect(chatRequestAt(client, 1).messages.at(-1)?.content).toBe(
      'la herramienta "romper" falló: fuente rota',
    );
    expect(result.events.at(1)).toEqual({
      type: "toolEnd",
      toolCallId: "call-romper",
      name: "romper",
      isError: true,
    });
  });

  it("trunca los resultados de herramienta por encima del límite", async () => {
    const registry = new ToolRegistry();
    registry.registerTool({
      name: "largo",
      description: "devuelve mucho texto",
      schema: z.object({}),
      handler: () => "x".repeat(50),
    });
    const client = new MockLLMClient({
      responses: [toolTurn([toolCall("largo", {})]), finalTurn("Ok")],
    });
    const runtime = createAgentRuntime({ client, registry, limits: { maxToolResultChars: 10 } });

    await runtime.run({ history: [], userMessage: "dame texto" });

    expect(chatRequestAt(client, 1).messages.at(-1)?.content).toBe(
      "xxxxxxxxxx…[truncado: 40 caracteres omitidos]",
    );
  });

  it("corta con estado limite al agotar maxSteps y conserva el estado parcial", async () => {
    const responses = Array.from({ length: 3 }, (_, index) =>
      toolTurn([toolCall("leer_objeto", { id: `n${index}` }, `call-${index}`)], `parcial ${index}`),
    );
    const client = new MockLLMClient({ responses });
    const runtime = createAgentRuntime({
      client,
      registry: createRegistry([]),
      limits: { maxSteps: 2 },
    });

    const result = await runtime.run({ history: [], userMessage: "lee en bucle" });

    expect(result.estado).toBe("limite");
    expect(result.steps).toBe(2);
    expect(result.toolCallsEjecutados).toHaveLength(2);
    expect(result.content).toBe("parcial 1");
    expect(result.error).toContain("maxSteps=2");
    expect(client.calls).toHaveLength(2);
  });

  it("usa maxSteps por defecto y no lanza excepciones al agotarlo", async () => {
    const responses = Array.from({ length: 12 }, (_, index) =>
      toolTurn([toolCall("leer_objeto", { id: `n${index}` }, `call-${index}`)]),
    );
    const client = new MockLLMClient({ responses });
    const runtime = createAgentRuntime({ client, registry: createRegistry([]) });

    const result = await runtime.run({ history: [], userMessage: "bucle" });

    expect(DEFAULT_AGENT_LIMITS.maxSteps).toBe(8);
    expect(result.estado).toBe("limite");
    expect(result.steps).toBe(8);
  });

  it("corta con estado limite si el LLM tarda más que timeoutMs", async () => {
    const client = new MockLLMClient({
      responses: [
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return finalTurn("tarde");
        },
      ],
    });
    const runtime = createAgentRuntime({
      client,
      registry: new ToolRegistry(),
      limits: { timeoutMs: 5 },
    });

    const result = await runtime.run({ history: [], userMessage: "date prisa" });

    expect(result.estado).toBe("limite");
    expect(result.error).toContain("timeoutMs=5");
    expect(result.content).toBe("");
  });

  it("corta con estado limite si una herramienta tarda más que timeoutMs", async () => {
    const registry = new ToolRegistry();
    registry.registerTool({
      name: "lenta",
      description: "tarda demasiado",
      schema: z.object({}),
      handler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return "demasiado tarde";
      },
    });
    const client = new MockLLMClient({ responses: [toolTurn([toolCall("lenta", {})])] });
    const runtime = createAgentRuntime({
      client,
      registry,
      limits: { timeoutMs: 5 },
    });

    const result = await runtime.run({ history: [], userMessage: "ejecuta" });

    expect(result.estado).toBe("limite");
    expect(result.error).toContain("timeoutMs=5");
    expect(result.toolCallsEjecutados).toEqual([]);
  });

  it("devuelve estado error y no lanza cuando el LLM falla", async () => {
    const client = new MockLLMClient({ responses: [new Error("proveedor caído")] });
    const runtime = createAgentRuntime({ client, registry: new ToolRegistry() });

    const result = await runtime.run({ history: [], userMessage: "hola" });

    expect(result.estado).toBe("error");
    expect(result.error).toBe("proveedor caído");
    expect(result.content).toBe("");
    expect(result.steps).toBe(1);
    expect(result.events).toEqual([]);
  });

  it("construye los mensajes con system prompt, historial y mensaje de usuario", async () => {
    const client = new MockLLMClient({ responses: [finalTurn("Vale")] });
    const runtime = createAgentRuntime({ client, registry: new ToolRegistry() });

    await runtime.run({
      role: "summarize",
      systemPrompt: "SISTEMA",
      history: [
        { role: "user", content: "hola" },
        { role: "assistant", content: "buenas" },
      ],
      userMessage: "sigue",
      options: { temperature: 0.2 },
    });

    const call = client.calls[0];
    if (call === undefined || call.method !== "chat") {
      throw new Error("se esperaba una llamada de chat");
    }
    expect(call.role).toBe("summarize");
    expect(call.request.messages).toEqual([
      { role: "system", content: "SISTEMA" },
      { role: "user", content: "hola" },
      { role: "assistant", content: "buenas" },
      { role: "user", content: "sigue" },
    ]);
    expect(call.request.options).toEqual({ temperature: 0.2 });
    expect(call.request.tools).toBeUndefined();
  });

  it("acumula el uso de tokens de todos los pasos", async () => {
    const client = new MockLLMClient({
      responses: [
        {
          ...toolTurn([toolCall("leer_objeto", { id: "n1" })]),
          usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
        },
        finalTurn("Listo", { promptTokens: 20, completionTokens: 5, totalTokens: 25 }),
      ],
    });
    const runtime = createAgentRuntime({ client, registry: createRegistry([]) });

    const result = await runtime.run({ history: [], userMessage: "lee" });

    expect(result.usage).toEqual({ promptTokens: 30, completionTokens: 7, totalTokens: 37 });
  });
});
