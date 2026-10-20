import type { LlmConfig } from "@migite/core";
import { describe, expect, it } from "vitest";
import { LlmError } from "./errors.js";
import { createOpenAICompatClient, type FetchLike } from "./openai-compat.js";
import { esArgumentosIlegibles } from "./runtime.js";
import type { ChatChunk, ChatRequest } from "./types.js";

const configA: LlmConfig = {
  providers: [
    {
      id: "proveedor-a",
      baseUrl: "https://api.a.test/v1",
      apiKeyEnv: "CLAVE_A",
    },
  ],
  roles: {
    chat: { provider: "proveedor-a", model: "modelo-a" },
    retrieve: { provider: "proveedor-a", model: "modelo-a" },
    summarize: { provider: "proveedor-a", model: "modelo-a" },
    embeddings: { provider: "proveedor-a", model: "embed-a" },
  },
};

const configB: LlmConfig = {
  providers: [
    {
      id: "proveedor-b",
      baseUrl: "https://api.b.test/v2/",
      apiKeyEnv: "CLAVE_B",
    },
  ],
  roles: {
    chat: { provider: "proveedor-b", model: "modelo-b" },
    retrieve: { provider: "proveedor-b", model: "modelo-b" },
    summarize: { provider: "proveedor-b", model: "modelo-b" },
    embeddings: { provider: "proveedor-b", model: "embed-b" },
  },
};

const chatRequest: ChatRequest = {
  messages: [{ role: "user", content: "hola" }],
};

const chatResponseBody = {
  choices: [{ message: { role: "assistant", content: "hola" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
};

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

const sseEvent = (payload: unknown): string => `data: ${JSON.stringify(payload)}\r\n\r\n`;

const streamResponse = (pieces: readonly string[]): Response =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const piece of pieces) {
          controller.enqueue(encoder.encode(piece));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );

const collect = async (iterable: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> => {
  const chunks: ChatChunk[] = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  return chunks;
};

const capturedError = async (promise: Promise<unknown>): Promise<LlmError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LlmError) {
      return error;
    }
    throw error;
  }
  throw new Error("se esperaba un LlmError");
};

const clientWith = (
  fetch: FetchLike,
  env: Readonly<Record<string, string | undefined>> = { CLAVE_A: "clave-a" },
) => createOpenAICompatClient(configA, { fetch, env });

const configConBaseUrl = (baseUrl: string): LlmConfig => ({
  providers: [{ id: "proveedor-test", baseUrl, apiKeyEnv: "CLAVE_A" }],
  roles: {
    chat: { provider: "proveedor-test", model: "modelo-test" },
    retrieve: { provider: "proveedor-test", model: "modelo-test" },
    summarize: { provider: "proveedor-test", model: "modelo-test" },
    embeddings: { provider: "proveedor-test", model: "modelo-test" },
  },
});

describe("createOpenAICompatClient", () => {
  it("cambiar de proveedor = cambiar configuración", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return url.endsWith("/embeddings")
        ? jsonResponse({ data: [{ embedding: [0.1] }] })
        : jsonResponse(chatResponseBody);
    };

    const clientA = createOpenAICompatClient(configA, {
      fetch: fetchMock,
      env: { CLAVE_A: "clave-a" },
    });
    const clientB = createOpenAICompatClient(configB, {
      fetch: fetchMock,
      env: { CLAVE_B: "clave-b" },
    });

    await clientA.chat("chat", chatRequest);
    await clientB.chat("chat", chatRequest);
    await clientB.embed("embeddings", ["uno"]);

    expect(calls.map((call) => call.url)).toEqual([
      "https://api.a.test/v1/chat/completions",
      "https://api.b.test/v2/chat/completions",
      "https://api.b.test/v2/embeddings",
    ]);
    expect(calls.map((call) => new Headers(call.init.headers).get("authorization"))).toEqual([
      "Bearer clave-a",
      "Bearer clave-b",
      "Bearer clave-b",
    ]);
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ model: "modelo-a" });
    expect(JSON.parse(String(calls[1]?.init.body))).toMatchObject({ model: "modelo-b" });
    expect(JSON.parse(String(calls[2]?.init.body))).toEqual({ model: "embed-b", input: ["uno"] });
    expect(calls.every((call) => call.init.method === "POST")).toBe(true);
    expect(
      calls.every((call) => new Headers(call.init.headers).get("user-agent") === "migite/0.1.0"),
    ).toBe(true);
  });

  it("envía user-agent y x-opencode-session estable por defecto o explícito por petición", async () => {
    const headersSeen: Headers[] = [];
    const client = clientWith(async (_url, init) => {
      headersSeen.push(new Headers(init.headers));
      if (_url.endsWith("/chat/completions") && JSON.parse(String(init.body)).stream === true) {
        return streamResponse([
          sseEvent({ choices: [{ delta: { content: "hola" }, finish_reason: "stop" }] }),
          "data: [DONE]\r\n\r\n",
        ]);
      }
      return jsonResponse(chatResponseBody);
    });

    await client.chat("chat", chatRequest);
    await client.chat("chat", chatRequest);
    await client.chat("chat", { ...chatRequest, sessionId: "conv-123" });
    await collect(client.chatStream("chat", { ...chatRequest, sessionId: "conv-456" }));

    expect(headersSeen.map((h) => h.get("user-agent"))).toEqual([
      "migite/0.1.0",
      "migite/0.1.0",
      "migite/0.1.0",
      "migite/0.1.0",
    ]);
    const defaultSession = headersSeen[0]?.get("x-opencode-session");
    expect(defaultSession).toBeTruthy();
    expect(headersSeen[1]?.get("x-opencode-session")).toBe(defaultSession);
    expect(headersSeen[2]?.get("x-opencode-session")).toBe("conv-123");
    expect(headersSeen[3]?.get("x-opencode-session")).toBe("conv-456");
  });

  it("parsea la respuesta de chat con contenido, uso y motivo de fin", async () => {
    const client = clientWith(async () => jsonResponse(chatResponseBody));

    await expect(client.chat("chat", chatRequest)).resolves.toEqual({
      message: { content: "hola", toolCalls: [] },
      finishReason: "stop",
      usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
    });
  });

  it("parsea tool calls con arguments JSON", async () => {
    const client = clientWith(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: { name: "buscar", arguments: '{"consulta":"notas","limite":3}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }),
    );

    await expect(client.chat("chat", chatRequest)).resolves.toEqual({
      message: {
        content: "",
        toolCalls: [{ id: "call-1", name: "buscar", arguments: { consulta: "notas", limite: 3 } }],
      },
      finishReason: "tool_calls",
    });
  });

  it.each(['{"consulta":', "texto plano", "42"])(
    "marca como ilegibles los arguments del proveedor que no son un objeto JSON válido (%s)",
    async (rawArguments) => {
      const client = clientWith(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: "",
                tool_calls: [
                  {
                    id: "call-1",
                    type: "function",
                    function: { name: "buscar", arguments: rawArguments },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        }),
      );

      const response = await client.chat("chat", chatRequest);

      const [toolCall] = response.message.toolCalls;
      expect(toolCall).toEqual({ id: "call-1", name: "buscar", arguments: {} });
      expect(esArgumentosIlegibles(toolCall?.arguments ?? {})).toBe(true);
      expect(response.finishReason).toBe("tool_calls");
    },
  );

  it("mapea historial, herramientas y opciones al formato OpenAI", async () => {
    let body: unknown;
    const client = clientWith(async (_url, init) => {
      body = JSON.parse(String(init.body));
      return jsonResponse(chatResponseBody);
    });

    const richRequest: ChatRequest = {
      messages: [
        { role: "system", content: "eres un asistente breve" },
        { role: "user", content: "busca notas" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call-1", name: "buscar", arguments: { consulta: "notas" } }],
        },
        { role: "tool", content: '{"resultado":1}', toolCallId: "call-1", name: "buscar" },
      ],
      tools: [{ name: "buscar", description: "busca notas", parameters: { type: "object" } }],
      toolChoice: { name: "buscar" },
      options: { temperature: 0.2, maxTokens: 100, topP: 0.9, stop: ["\n"] },
    };

    await client.chat("chat", richRequest);

    expect(body).toEqual({
      model: "modelo-a",
      messages: [
        { role: "system", content: "eres un asistente breve" },
        { role: "user", content: "busca notas" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "buscar", arguments: '{"consulta":"notas"}' },
            },
          ],
        },
        { role: "tool", content: '{"resultado":1}', tool_call_id: "call-1", name: "buscar" },
      ],
      tools: [
        {
          type: "function",
          function: { name: "buscar", description: "busca notas", parameters: { type: "object" } },
        },
      ],
      tool_choice: { type: "function", function: { name: "buscar" } },
      temperature: 0.2,
      max_tokens: 100,
      top_p: 0.9,
      stop: ["\n"],
      stream: false,
    });
  });

  it("no envía payload redundante en una petición mínima", async () => {
    let body: Record<string, unknown> = {};
    const client = clientWith(async (_url, init) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return jsonResponse(chatResponseBody);
    });

    await client.chat("chat", chatRequest);

    expect(Object.keys(body).sort()).toEqual(["messages", "model", "stream"]);
  });

  it("acepta tool_choice como cadena y omite la lista vacía de herramientas", async () => {
    let body: Record<string, unknown> = {};
    const client = clientWith(async (_url, init) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return jsonResponse(chatResponseBody);
    });

    await client.chat("chat", { ...chatRequest, tools: [], toolChoice: "required" });

    expect(body.tool_choice).toBe("required");
    expect(body.tools).toBeUndefined();
  });

  it.each([
    [401, "clave inválida"],
    [429, "demasiadas peticiones"],
    [500, "fallo interno"],
  ] as const)(
    "convierte HTTP %i en LlmError con el mensaje del proveedor",
    async (status, message) => {
      const client = clientWith(async () => jsonResponse({ error: { message } }, status));

      const error = await capturedError(client.chat("chat", chatRequest));

      expect(error.message).toContain(String(status));
      expect(error.message).toContain(message);
    },
  );

  it("no vuelca la clave del entorno en el mensaje de error", async () => {
    const client = clientWith(
      async () =>
        jsonResponse({ error: { message: "la clave clave-secreta-a no es válida" } }, 401),
      { CLAVE_A: "clave-secreta-a" },
    );

    const error = await capturedError(client.chat("chat", chatRequest));

    expect(error.message).toContain("401");
    expect(error.message).toContain("[redactado]");
    expect(error.message).not.toContain("clave-secreta-a");
  });

  it.each([
    ["ausente", {}],
    ["vacía", { CLAVE_A: "" }],
  ])("falla con error claro si la variable de entorno está %s", async (_case, env) => {
    const client = clientWith(async () => jsonResponse(chatResponseBody), env);

    const error = await capturedError(client.chat("chat", chatRequest));

    expect(error.message).toContain("CLAVE_A");
    expect(error.message).toContain("BYOK");
  });

  it("convierte un fallo de red en LlmError con causa", async () => {
    const client = clientWith(async () => {
      throw new TypeError("fetch failed");
    });

    const error = await capturedError(client.chat("chat", chatRequest));

    expect(error.message).toMatch(/no se pudo contactar/);
    expect(error.message).toContain("proveedor-a");
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it("falla con error claro si la respuesta no es JSON", async () => {
    const client = clientWith(async () => new Response("<html>error</html>", { status: 200 }));

    const error = await capturedError(client.chat("chat", chatRequest));

    expect(error.message).toMatch(/no JSON/);
  });

  it("falla con error claro si la respuesta de chat viene sin choices", async () => {
    const client = clientWith(async () =>
      jsonResponse({ error: { message: "el modelo no existe" } }),
    );

    const error = await capturedError(client.chat("chat", chatRequest));

    expect(error.message).toContain("el modelo no existe");
  });

  it("devuelve los embeddings y valida su forma", async () => {
    let body: unknown;
    const client = clientWith(async (_url, init) => {
      body = JSON.parse(String(init.body));
      return jsonResponse({ data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3] }] });
    });

    await expect(client.embed("embeddings", ["uno", "dos"])).resolves.toEqual([[0.1, 0.2], [0.3]]);
    expect(body).toEqual({ model: "embed-a", input: ["uno", "dos"] });

    const invalidEmbedding = clientWith(async () =>
      jsonResponse({ data: [{ embedding: ["no", "números"] }] }),
    );
    await expect(invalidEmbedding.embed("embeddings", ["uno"])).rejects.toThrow(
      /embedding inválido en la posición 0/,
    );

    const missingData = clientWith(async () => jsonResponse({}));
    await expect(missingData.embed("embeddings", ["uno"])).rejects.toThrow(/sin campo data/);
  });

  it("convierte el SSE en deltas de contenido, tool calls y cierre", async () => {
    let body: unknown;
    const client = clientWith(async (_url, init) => {
      body = JSON.parse(String(init.body));
      return streamResponse([
        sseEvent({ choices: [{ delta: { role: "assistant", content: "Ho" } }] }),
        sseEvent({ choices: [{ delta: { content: "la" } }] }),
        sseEvent({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call-1",
                    function: { name: "buscar", arguments: '{"consulta":' },
                  },
                ],
              },
            },
          ],
        }),
        sseEvent({
          choices: [
            {
              delta: { tool_calls: [{ index: 0, function: { arguments: '"notas"}' } }] },
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 4, total_tokens: 5 },
        }),
        "data: [DONE]\r\n\r\n",
      ]);
    });

    const chunks = await collect(client.chatStream("chat", chatRequest));

    expect(chunks).toEqual([
      { contentDelta: "Ho" },
      { contentDelta: "la" },
      {
        toolCallDeltas: [
          { index: 0, id: "call-1", name: "buscar", argumentsDelta: '{"consulta":' },
        ],
      },
      {
        toolCallDeltas: [{ index: 0, argumentsDelta: '"notas"}' }],
        finishReason: "tool_calls",
        usage: { promptTokens: 1, completionTokens: 4, totalTokens: 5 },
      },
    ]);
    expect(body).toMatchObject({ stream: true, model: "modelo-a" });
  });

  it("acepta múltiples tool_calls en eventos SSE separados sin index, ignora id/name vacíos y preserva extra_content", async () => {
    let sentBody: Record<string, unknown> = {};
    const client = clientWith(async (_url, init) => {
      const parsed = JSON.parse(String(init.body)) as Record<string, unknown>;
      sentBody = parsed;
      if (parsed.stream === true) {
        return streamResponse([
          sseEvent({
            choices: [
              {
                delta: {
                  role: "assistant",
                  tool_calls: [
                    {
                      id: "call_gemini_1",
                      type: "function",
                      function: { name: "listar_tipos", arguments: "{}" },
                      extra_content: { google: { thought_signature: "sig-123" } },
                    },
                  ],
                },
              },
            ],
          }),
          sseEvent({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      id: "call_gemini_2",
                      type: "function",
                      function: { name: "buscar", arguments: '{"q":"a"}' },
                    },
                  ],
                },
              },
            ],
          }),
          sseEvent({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 1,
                      id: "",
                      type: "function",
                      function: { name: "", arguments: "" },
                    },
                  ],
                },
              },
            ],
          }),
          sseEvent({ choices: [{ delta: {}, finish_reason: "stop" }] }),
          "data: [DONE]\r\n\r\n",
        ]);
      }
      return jsonResponse(chatResponseBody);
    });

    const chunks = await collect(client.chatStream("chat", chatRequest));
    expect(chunks).toEqual([
      {
        toolCallDeltas: [
          {
            index: 0,
            id: "call_gemini_1",
            name: "listar_tipos",
            argumentsDelta: "{}",
            extraContent: { google: { thought_signature: "sig-123" } },
          },
        ],
      },
      {
        toolCallDeltas: [
          {
            index: 1,
            id: "call_gemini_2",
            name: "buscar",
            argumentsDelta: '{"q":"a"}',
          },
        ],
      },
      {
        toolCallDeltas: [
          {
            index: 1,
            argumentsDelta: "",
          },
        ],
      },
      { finishReason: "stop" },
    ]);

    await client.chat("chat", {
      messages: [
        {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "call_gemini_1",
              name: "listar_tipos",
              arguments: {},
              extraContent: { google: { thought_signature: "sig-123" } },
            },
          ],
        },
      ],
    });
    expect(sentBody.messages).toEqual([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_gemini_1",
            type: "function",
            function: { name: "listar_tipos", arguments: "{}" },
            extra_content: { google: { thought_signature: "sig-123" } },
          },
        ],
      },
    ]);
  });

  it("reensambla eventos SSE partidos entre lecturas e ignora comentarios", async () => {
    const raw =
      sseEvent({ choices: [{ delta: { content: "par" } }] }) +
      ": ping\r\n\r\n" +
      "event: message\r\n" +
      sseEvent({ choices: [{ delta: { content: "tido" }, finish_reason: "stop" }] }) +
      "data: [DONE]\r\n\r\n";
    const pieces = [raw.slice(0, 13), raw.slice(13, 29), raw.slice(29, 61), raw.slice(61)];
    const client = clientWith(async () => streamResponse(pieces));

    await expect(collect(client.chatStream("chat", chatRequest))).resolves.toEqual([
      { contentDelta: "par" },
      { contentDelta: "tido", finishReason: "stop" },
    ]);
  });

  it("convierte un error HTTP del stream en LlmError", async () => {
    const client = clientWith(async () =>
      jsonResponse({ error: { message: "sin permiso en el proveedor" } }, 403),
    );

    const error = await capturedError(collect(client.chatStream("chat", chatRequest)));

    expect(error.message).toContain("403");
    expect(error.message).toContain("sin permiso en el proveedor");
  });

  it("convierte un fallo de red del stream en LlmError", async () => {
    const client = clientWith(async () => {
      throw new TypeError("fetch failed");
    });

    const error = await capturedError(collect(client.chatStream("chat", chatRequest)));

    expect(error.message).toMatch(/no se pudo contactar/);
  });

  it("falla si el proveedor no devuelve cuerpo de streaming", async () => {
    const client = clientWith(async () => new Response(null, { status: 200 }));

    await expect(collect(client.chatStream("chat", chatRequest))).rejects.toThrow(
      /cuerpo de streaming/,
    );
  });

  it("convierte un evento SSE no JSON en LlmError", async () => {
    const client = clientWith(async () => streamResponse(["data: {no-json}\r\n\r\n"]));

    await expect(collect(client.chatStream("chat", chatRequest))).rejects.toThrow(
      /SSE con JSON inválido/,
    );
  });

  it.each([
    ["sin separador", (line: string) => line],
    ["con separador", (line: string) => `${line}\r\n\r\n`],
  ])("rechaza un evento SSE gigante (%s) sin acumular el buffer", async (_case, wrap) => {
    const line = `data: ${"a".repeat(1_100_000)}`;
    const client = clientWith(async () => streamResponse([wrap(line)]));

    const error = await capturedError(collect(client.chatStream("chat", chatRequest)));

    expect(error.message).toMatch(/supera el máximo/);
  });

  it("rechaza una respuesta de streaming que supera el máximo total de bytes", async () => {
    const event = `data: ${JSON.stringify({ choices: [{ delta: { content: "x" } }] })}\r\n\r\n`;
    const client = clientWith(async () => streamResponse([event.repeat(200_000)]));

    const error = await capturedError(collect(client.chatStream("chat", chatRequest)));

    expect(error.message).toMatch(/supera el máximo/);
  });

  it("aborta la petición y falla con error claro al agotar el tiempo de espera", async () => {
    let signal: AbortSignal | undefined;
    const client = createOpenAICompatClient(configA, {
      timeoutMs: 10,
      env: { CLAVE_A: "clave-a" },
      fetch: (_url, init) => {
        signal = init.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("abortado")));
        });
      },
    });

    const error = await capturedError(client.chat("chat", chatRequest));

    expect(error.message).toMatch(/tiempo de espera agotado/);
    expect(signal?.aborted).toBe(true);
  });

  it("aborta el stream al agotar el tiempo de espera", async () => {
    let signal: AbortSignal | undefined;
    const client = createOpenAICompatClient(configA, {
      timeoutMs: 10,
      env: { CLAVE_A: "clave-a" },
      fetch: async (_url, init) => {
        signal = init.signal ?? undefined;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            init.signal?.addEventListener("abort", () => controller.error(new Error("abortado")));
          },
        });
        return new Response(body, { status: 200 });
      },
    });

    const error = await capturedError(collect(client.chatStream("chat", chatRequest)));

    expect(error.message).toMatch(/tiempo de espera agotado/);
    expect(signal?.aborted).toBe(true);
  });

  it("aborta la petición al terminar el stream", async () => {
    let signal: AbortSignal | undefined;
    const client = createOpenAICompatClient(configA, {
      env: { CLAVE_A: "clave-a" },
      fetch: async (_url, init) => {
        signal = init.signal ?? undefined;
        return streamResponse([
          sseEvent({ choices: [{ delta: { content: "hola" }, finish_reason: "stop" }] }),
          "data: [DONE]\r\n\r\n",
        ]);
      },
    });

    await collect(client.chatStream("chat", chatRequest));

    expect(signal?.aborted).toBe(true);
  });

  it("aborta la petición si se deja de consumir el stream", async () => {
    let signal: AbortSignal | undefined;
    const client = createOpenAICompatClient(configA, {
      env: { CLAVE_A: "clave-a" },
      fetch: async (_url, init) => {
        signal = init.signal ?? undefined;
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(sseEvent({ choices: [{ delta: { content: "hola" } }] })),
              );
            },
          }),
          { status: 200 },
        );
      },
    });

    const iterator = client.chatStream("chat", chatRequest)[Symbol.asyncIterator]();
    await iterator.next();
    await iterator.return?.();

    expect(signal?.aborted).toBe(true);
  });

  it("rechaza una baseUrl http:// que no sea loopback sin llegar a llamar al proveedor", async () => {
    let called = false;
    const client = createOpenAICompatClient(configConBaseUrl("http://api.insegura.test/v1"), {
      fetch: async () => {
        called = true;
        return jsonResponse(chatResponseBody);
      },
      env: { CLAVE_A: "clave-a" },
    });

    const error = await capturedError(client.chat("chat", chatRequest));

    expect(error.message).toContain("http://");
    expect(error.message).toContain("https");
    expect(called).toBe(false);
  });

  it.each(["http://localhost:11434/v1", "http://127.0.0.1:11434/v1", "http://[::1]:11434/v1"])(
    "permite http:// en loopback (%s)",
    async (baseUrl) => {
      const client = createOpenAICompatClient(configConBaseUrl(baseUrl), {
        fetch: async () => jsonResponse(chatResponseBody),
        env: { CLAVE_A: "clave-a" },
      });

      await expect(client.chat("chat", chatRequest)).resolves.toMatchObject({
        message: { content: "hola" },
      });
    },
  );

  it("propaga el error de un rol no configurado", async () => {
    const incomplete = {
      providers: configA.providers,
      roles: {
        chat: configA.roles.chat,
        retrieve: configA.roles.retrieve,
        summarize: configA.roles.summarize,
      },
    } as unknown as LlmConfig;
    const client = createOpenAICompatClient(incomplete, {
      fetch: async () => jsonResponse(chatResponseBody),
      env: { CLAVE_A: "clave-a" },
    });

    await expect(client.embed("embeddings", ["uno"])).rejects.toThrow(LlmError);
    await expect(client.embed("embeddings", ["uno"])).rejects.toThrow(/embeddings/);
  });
});
