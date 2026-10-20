import { describe, expect, it } from "vitest";
import { LlmError } from "./errors.js";
import { MockLLMClient } from "./mock.js";
import type { ChatChunk, ChatRequest, ChatResponse, ToolCall } from "./types.js";

const request: ChatRequest = {
  messages: [{ role: "user", content: "hola" }],
};

const toolCall: ToolCall = {
  id: "call-1",
  name: "buscar",
  arguments: { consulta: "notas" },
};

const response: ChatResponse = {
  message: { content: "hola", toolCalls: [] },
  finishReason: "stop",
  usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
};

const collect = async (iterable: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> => {
  const chunks: ChatChunk[] = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  return chunks;
};

describe("MockLLMClient", () => {
  it("devuelve la respuesta guionizada y registra la llamada", async () => {
    const client = new MockLLMClient({ responses: [response] });

    await expect(client.chat("chat", request)).resolves.toEqual(response);
    expect(client.calls).toEqual([{ method: "chat", role: "chat", request }]);
  });

  it("pasa el request a las respuestas definidas como función", async () => {
    const client = new MockLLMClient({
      responses: [
        (received) => ({
          message: { content: `eco: ${received.messages[0]?.content ?? ""}`, toolCalls: [] },
          finishReason: "stop",
        }),
      ],
    });

    await expect(client.chat("summarize", request)).resolves.toEqual({
      message: { content: "eco: hola", toolCalls: [] },
      finishReason: "stop",
    });
    expect(client.calls).toEqual([{ method: "chat", role: "summarize", request }]);
  });

  it("devuelve tool calls guionizadas", async () => {
    const toolResponse: ChatResponse = {
      message: { content: "", toolCalls: [toolCall] },
      finishReason: "tool_calls",
    };
    const client = new MockLLMClient({ responses: [toolResponse] });

    const received = await client.chat("chat", request);
    expect(received.message.toolCalls).toEqual([toolCall]);
    expect(received.finishReason).toBe("tool_calls");
  });

  it("propaga los errores guionizados y registra igualmente la llamada", async () => {
    const client = new MockLLMClient({ responses: [new Error("fallo simulado")] });

    await expect(client.chat("chat", request)).rejects.toThrow("fallo simulado");
    expect(client.calls).toEqual([{ method: "chat", role: "chat", request }]);
  });

  it("falla si el guion de respuestas se agota", async () => {
    const client = new MockLLMClient();

    await expect(client.chat("chat", request)).rejects.toThrow(LlmError);
    await expect(client.chat("chat", request)).rejects.toThrow(/guion de chat/);
  });

  it("emite el stream como deltas de contenido, tool calls y cierre", async () => {
    const streamResponse: ChatResponse = {
      message: { content: "hola", toolCalls: [toolCall] },
      finishReason: "tool_calls",
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
    };
    const client = new MockLLMClient({ responses: [streamResponse] });

    const chunks = await collect(client.chatStream("chat", request));

    expect(chunks).toEqual([
      { contentDelta: "hola" },
      {
        toolCallDeltas: [
          {
            index: 0,
            id: "call-1",
            name: "buscar",
            argumentsDelta: JSON.stringify({ consulta: "notas" }),
          },
        ],
      },
      {
        finishReason: "tool_calls",
        usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
      },
    ]);
    expect(client.calls).toEqual([{ method: "chatStream", role: "chat", request }]);
  });

  it("no emite delta de contenido cuando la respuesta solo trae tool calls", async () => {
    const toolResponse: ChatResponse = {
      message: { content: "", toolCalls: [toolCall] },
      finishReason: "tool_calls",
    };
    const client = new MockLLMClient({ responses: [toolResponse] });

    const chunks = await collect(client.chatStream("chat", request));

    expect(chunks).toEqual([
      {
        toolCallDeltas: [
          {
            index: 0,
            id: "call-1",
            name: "buscar",
            argumentsDelta: JSON.stringify({ consulta: "notas" }),
          },
        ],
      },
      { finishReason: "tool_calls" },
    ]);
  });

  it("propaga los errores guionizados en el stream", async () => {
    const client = new MockLLMClient({ responses: [new Error("stream roto")] });

    await expect(collect(client.chatStream("chat", request))).rejects.toThrow("stream roto");
  });

  it("devuelve los embeddings guionizados y registra la llamada", async () => {
    const client = new MockLLMClient({
      embeddings: [
        [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
      ],
    });

    await expect(client.embed("embeddings", ["uno", "dos"])).resolves.toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(client.calls).toEqual([{ method: "embed", role: "embeddings", texts: ["uno", "dos"] }]);
  });

  it("calcula embeddings con una función guionizada sobre los textos", async () => {
    const client = new MockLLMClient({
      embeddings: [(texts) => texts.map((_, index) => [index, index + 1])],
    });

    await expect(client.embed("embeddings", ["uno", "dos"])).resolves.toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it("propaga los errores guionizados de embeddings", async () => {
    const client = new MockLLMClient({ embeddings: [new Error("sin embeddings")] });

    await expect(client.embed("embeddings", ["uno"])).rejects.toThrow("sin embeddings");
  });

  it("falla si el guion de embeddings se agota", async () => {
    const client = new MockLLMClient();

    await expect(client.embed("embeddings", ["uno"])).rejects.toThrow(/guion de embeddings/);
  });
});
