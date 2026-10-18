import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MockLLMClient } from "./mock.js";
import { envolverDatosVault } from "./prompt.js";
import { type AgentRunResult, type AgentStreamEvent, createAgentRuntime } from "./runtime.js";
import { ToolRegistry } from "./tools.js";
import type {
  ChatChunk,
  ChatRequest,
  ChatResponse,
  LLMClient,
  LLMRole,
  ToolCall,
} from "./types.js";

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

type StreamOutcome = {
  readonly events: AgentStreamEvent[];
  readonly result: AgentRunResult;
};

const drain = async (
  stream: AsyncGenerator<AgentStreamEvent, AgentRunResult>,
): Promise<StreamOutcome> => {
  const events: AgentStreamEvent[] = [];
  let step = await stream.next();
  while (!step.done) {
    events.push(step.value);
    step = await stream.next();
  }
  return { events, result: step.value };
};

describe("AgentRuntime.runStream", () => {
  it("emite deltas y herramienta intermedia en orden y devuelve el resultado", async () => {
    const executed: string[] = [];
    const client = new MockLLMClient({
      responses: [
        toolTurn([toolCall("leer_objeto", { id: "n1" })], "Voy a leer n1."),
        finalTurn("Listo: el contenido es A."),
      ],
    });
    const runtime = createAgentRuntime({ client, registry: createRegistry(executed) });

    const { events, result } = await drain(
      runtime.runStream({ history: [], userMessage: "lee n1" }),
    );

    expect(events).toEqual([
      { type: "delta", texto: "Voy a leer n1." },
      { type: "toolStart", toolCallId: "call-leer_objeto", name: "leer_objeto" },
      { type: "toolEnd", toolCallId: "call-leer_objeto", name: "leer_objeto", isError: false },
      { type: "delta", texto: "Listo: el contenido es A." },
    ]);
    expect(result.estado).toBe("completado");
    expect(result.content).toBe("Voy a leer n1.\n\nListo: el contenido es A.");
    expect(result.steps).toBe(2);
    expect(result.finishReason).toBe("stop");
    expect(result.events).toEqual([
      { type: "toolStart", toolCallId: "call-leer_objeto", name: "leer_objeto" },
      { type: "toolEnd", toolCallId: "call-leer_objeto", name: "leer_objeto", isError: false },
    ]);
    expect(result.toolCallsEjecutados).toEqual([toolCall("leer_objeto", { id: "n1" })]);
    expect(executed).toEqual(["n1"]);
    expect(client.calls.map((call) => call.method)).toEqual(["chatStream", "chatStream"]);

    const first = client.calls[0];
    if (first === undefined || first.method !== "chatStream") {
      throw new Error("se esperaba una llamada de chatStream");
    }
    expect(first.role).toBe("chat");
    expect(first.request.messages).toEqual([{ role: "user", content: "lee n1" }]);
    expect(first.request.tools?.map((tool) => tool.name)).toEqual(["leer_objeto"]);
  });

  it("construye los mensajes con system prompt, historial y opciones", async () => {
    const client = new MockLLMClient({ responses: [finalTurn("Vale")] });
    const runtime = createAgentRuntime({ client, registry: new ToolRegistry() });

    await drain(
      runtime.runStream({
        role: "summarize",
        systemPrompt: "SISTEMA",
        history: [
          { role: "user", content: "hola" },
          { role: "assistant", content: "buenas" },
        ],
        userMessage: "sigue",
        options: { temperature: 0.2 },
      }),
    );

    const call = client.calls[0];
    if (call === undefined || call.method !== "chatStream") {
      throw new Error("se esperaba una llamada de chatStream");
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

  it("corta con estado limite al agotar maxSteps y conserva lo emitido", async () => {
    const responses = Array.from({ length: 3 }, (_, index) =>
      toolTurn([toolCall("leer_objeto", { id: `n${index}` }, `call-${index}`)], `parcial ${index}`),
    );
    const client = new MockLLMClient({ responses });
    const runtime = createAgentRuntime({
      client,
      registry: createRegistry([]),
      limits: { maxSteps: 2 },
    });

    const { events, result } = await drain(
      runtime.runStream({ history: [], userMessage: "lee en bucle" }),
    );

    expect(result.estado).toBe("limite");
    expect(result.steps).toBe(2);
    expect(result.error).toContain("maxSteps=2");
    expect(result.content).toBe("parcial 0\n\nparcial 1");
    expect(events.filter((event) => event.type === "delta")).toEqual([
      { type: "delta", texto: "parcial 0" },
      { type: "delta", texto: "parcial 1" },
    ]);
    expect(client.calls).toHaveLength(2);
  });

  it("conserva el texto parcial emitido si el stream se agota por timeout", async () => {
    const client: LLMClient = {
      async chat(): Promise<ChatResponse> {
        throw new Error("no se esperaba una llamada de chat directo");
      },
      async *chatStream(): AsyncIterable<ChatChunk> {
        yield { contentDelta: "voy por la mitad" };
        await new Promise((resolver) => setTimeout(resolver, 1000));
        yield { contentDelta: " y termino" };
        yield { finishReason: "stop" };
      },
      async embed(): Promise<number[][]> {
        return [];
      },
    };
    const runtime = createAgentRuntime({
      client,
      registry: new ToolRegistry(),
      limits: { timeoutMs: 100 },
    });

    const { events, result } = await drain(
      runtime.runStream({ history: [], userMessage: "date prisa" }),
    );

    expect(result.estado).toBe("limite");
    expect(result.error).toContain("timeoutMs=100");
    expect(result.content).toBe("voy por la mitad");
    expect(events).toEqual([{ type: "delta", texto: "voy por la mitad" }]);
  });

  it("conserva el texto parcial emitido si el stream falla a mitad", async () => {
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
    const runtime = createAgentRuntime({ client, registry: new ToolRegistry() });

    const { events, result } = await drain(runtime.runStream({ history: [], userMessage: "hola" }));

    expect(result.estado).toBe("error");
    expect(result.error).toBe("conexión cortada");
    expect(result.content).toBe("parcial");
    expect(events).toEqual([{ type: "delta", texto: "parcial" }]);
  });

  it("corta con estado limite si el stream tarda más que timeoutMs", async () => {
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

    const { events, result } = await drain(
      runtime.runStream({ history: [], userMessage: "date prisa" }),
    );

    expect(result.estado).toBe("limite");
    expect(result.error).toContain("timeoutMs=5");
    expect(events).toEqual([]);
  });

  it("devuelve estado error y no lanza cuando el proveedor falla", async () => {
    const client = new MockLLMClient({ responses: [new Error("proveedor caído")] });
    const runtime = createAgentRuntime({ client, registry: new ToolRegistry() });

    const { events, result } = await drain(runtime.runStream({ history: [], userMessage: "hola" }));

    expect(result.estado).toBe("error");
    expect(result.error).toBe("proveedor caído");
    expect(result.content).toBe("");
    expect(result.steps).toBe(1);
    expect(events).toEqual([]);
    expect(client.calls.map((call) => call.method)).toEqual(["chatStream"]);
  });

  it("acumula una tool call repartida entre varios chunks", async () => {
    const executed: string[] = [];
    const requests: ChatRequest[] = [];
    let turn = 0;
    const client: LLMClient = {
      async chat(): Promise<ChatResponse> {
        throw new Error("no se esperaba una llamada de chat directo");
      },
      async *chatStream(_role: LLMRole, request: ChatRequest): AsyncIterable<ChatChunk> {
        requests.push(request);
        if (turn === 0) {
          turn += 1;
          yield { toolCallDeltas: [{ index: 0, id: "call-1", name: "leer_objeto" }] };
          yield { toolCallDeltas: [{ index: 0, argumentsDelta: '{"id":' }] };
          yield { toolCallDeltas: [{ index: 0, argumentsDelta: '"n1"}' }] };
          yield { finishReason: "tool_calls" };
          return;
        }
        yield { contentDelta: "Fin" };
        yield { finishReason: "stop" };
      },
      async embed(): Promise<number[][]> {
        return [];
      },
    };
    const runtime = createAgentRuntime({ client, registry: createRegistry(executed) });

    const { events, result } = await drain(
      runtime.runStream({ history: [], userMessage: "lee n1" }),
    );

    expect(executed).toEqual(["n1"]);
    expect(result.estado).toBe("completado");
    expect(result.content).toBe("Fin");
    expect(result.toolCallsEjecutados).toEqual([toolCall("leer_objeto", { id: "n1" }, "call-1")]);
    expect(events).toEqual([
      { type: "toolStart", toolCallId: "call-1", name: "leer_objeto" },
      { type: "toolEnd", toolCallId: "call-1", name: "leer_objeto", isError: false },
      { type: "delta", texto: "Fin" },
    ]);
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages.at(-1)).toEqual({
      role: "tool",
      content: envolverDatosVault("contenido de n1"),
      toolCallId: "call-1",
      name: "leer_objeto",
    });
  });

  it("trata los argumentos truncados del stream como error explícito y no ejecuta la herramienta", async () => {
    const executed: string[] = [];
    const requests: ChatRequest[] = [];
    let turn = 0;
    const client: LLMClient = {
      async chat(): Promise<ChatResponse> {
        throw new Error("no se esperaba una llamada de chat directo");
      },
      async *chatStream(_role: LLMRole, request: ChatRequest): AsyncIterable<ChatChunk> {
        requests.push(request);
        if (turn === 0) {
          turn += 1;
          yield { toolCallDeltas: [{ index: 0, id: "call-1", name: "leer_objeto" }] };
          yield { toolCallDeltas: [{ index: 0, argumentsDelta: '{"id":"n1' }] };
          yield { finishReason: "tool_calls" };
          return;
        }
        yield { contentDelta: "Fin" };
        yield { finishReason: "stop" };
      },
      async embed(): Promise<number[][]> {
        return [];
      },
    };
    const runtime = createAgentRuntime({ client, registry: createRegistry(executed) });

    const { events, result } = await drain(
      runtime.runStream({ history: [], userMessage: "lee n1" }),
    );

    expect(executed).toEqual([]);
    expect(result.estado).toBe("completado");
    expect(result.content).toBe("Fin");
    expect(result.toolCallsEjecutados).toHaveLength(1);
    expect(events).toEqual([
      { type: "toolStart", toolCallId: "call-1", name: "leer_objeto" },
      { type: "toolEnd", toolCallId: "call-1", name: "leer_objeto", isError: true },
      { type: "delta", texto: "Fin" },
    ]);
    expect(requests[1]?.messages.at(-1)?.content).toContain("argumentos ilegibles o truncados");
  });
});
