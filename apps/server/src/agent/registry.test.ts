import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapVault, writeObjectFile } from "@migite/core";
import { buildIndex, type IndexHandle, openIndex } from "@migite/index";
import {
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  createAgentRuntime,
  MockLLMClient,
  type ToolCall,
} from "@migite/llm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearRegistroDelAgente } from "./registry.js";

const BETA = "01JBETA0000000000000000000";

const toolCall = (name: string, args: Record<string, unknown>, id: string): ToolCall => ({
  id,
  name,
  arguments: args,
});

const toolTurn = (calls: readonly ToolCall[]): ChatResponse => ({
  message: { content: "", toolCalls: calls },
  finishReason: "tool_calls",
});

const finalTurn = (content: string): ChatResponse => ({
  message: { content, toolCalls: [] },
  finishReason: "stop",
});

const chatRequestAt = (client: MockLLMClient, index: number): ChatRequest => {
  const call = client.calls[index];
  if (call === undefined || call.method !== "chat") {
    throw new Error(`no hay llamada de chat en la posición ${index}`);
  }
  return call.request;
};

const toolMessagesAt = (client: MockLLMClient, index: number): ChatMessage[] =>
  chatRequestAt(client, index).messages.filter((message) => message.role === "tool");

const parseContent = (message: ChatMessage | undefined): unknown => {
  if (message === undefined) {
    throw new Error("no hay mensaje de herramienta que interpretar");
  }
  return JSON.parse(message.content) as unknown;
};

let root: string;
let vaultDir: string;
let handle: IndexHandle;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "migite-agent-registry-"));
  vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  bootstrapVault(vaultDir);
  mkdirSync(join(vaultDir, "proyectos"), { recursive: true });
  writeFileSync(
    join(vaultDir, "proyectos", "beta.md"),
    writeObjectFile(
      {
        id: BETA,
        type: "tarea",
        title: "Beta",
        created: "2026-10-01T09:00:00.000+02:00",
        updated: "2026-10-04T09:00:00.000+02:00",
        links: [],
        attributes: { etiquetas: ["trabajo"], estado: "pendiente" },
      },
      "Tarea pendiente de revisar el presupuesto.",
    ),
    { encoding: "utf8", flag: "w" },
  );
  handle = openIndex({ dbPath: join(root, "index.db") });
  buildIndex(handle.db, { vaultDir });
});

afterEach(() => {
  handle.close();
  rmSync(root, { recursive: true, force: true });
});

describe("crearRegistroDelAgente", () => {
  it("registra las herramientas de lectura y de escritura con sus nombres exactos", () => {
    const registry = crearRegistroDelAgente({ db: handle.db, vaultDir });

    expect(registry.definitions().map((definition) => definition.name)).toEqual([
      "buscar_conocimiento",
      "obtener_objeto",
      "listar_objetos",
      "listar_tipos",
      "crear_objeto",
      "editar_objeto",
      "borrar_objeto",
      "recordar_dato",
      "crear_tipo",
    ]);
  });

  it("devuelve al modelo los resultados con fuente al usar las herramientas de lectura", async () => {
    const client = new MockLLMClient({
      responses: [
        toolTurn([toolCall("buscar_conocimiento", { query: "presupuesto" }, "call-buscar")]),
        toolTurn([toolCall("obtener_objeto", { id_o_titulo: "Beta" }, "call-objeto")]),
        finalTurn("Según «Beta» (proyectos/beta.md), el presupuesto sigue pendiente."),
      ],
    });
    const runtime = createAgentRuntime({
      client,
      registry: crearRegistroDelAgente({ db: handle.db, vaultDir }),
    });

    const result = await runtime.run({
      history: [],
      userMessage: "¿qué sé del presupuesto?",
    });

    expect(result.estado).toBe("completado");
    expect(result.content).toContain("«Beta»");
    expect(result.toolCallsEjecutados.map((call) => call.name)).toEqual([
      "buscar_conocimiento",
      "obtener_objeto",
    ]);
    expect(chatRequestAt(client, 0).tools?.map((tool) => tool.name)).toEqual([
      "buscar_conocimiento",
      "obtener_objeto",
      "listar_objetos",
      "listar_tipos",
      "crear_objeto",
      "editar_objeto",
      "borrar_objeto",
      "recordar_dato",
      "crear_tipo",
    ]);

    const messages = toolMessagesAt(client, 2);
    expect(messages).toHaveLength(2);
    const busqueda = parseContent(messages[0]) as {
      resultados: { fuente: string; fragmento?: string }[];
    };
    expect(busqueda.resultados[0]?.fuente).toBe(`«Beta» (proyectos/beta.md) — id ${BETA}`);
    expect(busqueda.resultados[0]?.fragmento).toContain("presupuesto");
    const objeto = parseContent(messages[1]) as { id: string; cuerpo: string };
    expect(objeto.id).toBe(BETA);
    expect(objeto.cuerpo).toContain("presupuesto");
  });
});
