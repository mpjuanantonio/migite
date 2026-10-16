import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapVault, createObjectRepository, writeObjectFile } from "@migite/core";
import {
  buildIndex,
  type IndexHandle,
  listarAcciones,
  listarMemorias,
  obtenerAccion,
  openIndex,
} from "@migite/index";
import {
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  createAgentRuntime,
  MockLLMClient,
  type ToolCall,
  type ToolExecution,
  ToolRegistry,
} from "@migite/llm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { confirmarAccion } from "../../services/acciones.js";
import { crearRegistroDelAgente } from "../registry.js";
import { registrarHerramientasDeEscritura } from "./write.js";

const BETA = "01JBETA0000000000000000000";
const FALTANTE = "01JXK2P4R5S6T7U8V9W0X1Y2Z";

const propuestaSchema = z.object({
  accion_propuesta: z.object({
    id: z.string(),
    tipoAccion: z.string(),
    estado: z.literal("pendiente"),
    resumen: z.string(),
  }),
});

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

let root: string;
let vaultDir: string;
let handle: IndexHandle;
let registry: ToolRegistry;

const snapshotVault = (dir: string): Record<string, string> => {
  const files: Record<string, string> = {};
  const walk = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(absolute, relative);
      } else {
        files[relative] = readFileSync(absolute, "utf8");
      }
    }
  };
  walk(dir, "");
  return files;
};

const ejecutar = (name: string, args: Record<string, unknown>): Promise<ToolExecution> =>
  registry.execute({ id: `call-${name}`, name, arguments: args });

const proponer = async (
  name: string,
  args: Record<string, unknown>,
): Promise<z.output<typeof propuestaSchema>> => {
  const execution = await ejecutar(name, args);
  expect(execution.isError).toBe(false);
  return propuestaSchema.parse(JSON.parse(execution.content) as unknown);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "migite-agent-write-"));
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
  registry = new ToolRegistry();
  registrarHerramientasDeEscritura(registry, { db: handle.db, vaultDir });
});

afterEach(() => {
  handle.close();
  rmSync(root, { recursive: true, force: true });
});

describe("crear_objeto", () => {
  it("crea la acción propuesta con el payload validado sin tocar el vault", async () => {
    const antes = snapshotVault(vaultDir);
    const args = {
      tipo: "tarea",
      titulo: "Preparar informe",
      atributos: { estado: "pendiente", etiquetas: ["trabajo"] },
      cuerpo: "con detalle",
      carpeta: "proyectos",
      enlaces: ["[[Beta]]"],
    };

    const body = await proponer("crear_objeto", args);

    expect(body.accion_propuesta.tipoAccion).toBe("crear_objeto");
    expect(body.accion_propuesta.estado).toBe("pendiente");
    expect(body.accion_propuesta.resumen).toBe("Crear tarea «Preparar informe»");
    const accion = obtenerAccion(handle.db, body.accion_propuesta.id);
    expect(accion?.estado).toBe("pendiente");
    expect(accion?.payload).toEqual(args);
    expect(snapshotVault(vaultDir)).toEqual(antes);
  });

  it("usa nota como tipo por defecto en el resumen", async () => {
    const body = await proponer("crear_objeto", { titulo: "Suelta" });

    expect(body.accion_propuesta.resumen).toBe("Crear nota «Suelta»");
    expect(obtenerAccion(handle.db, body.accion_propuesta.id)?.payload).toEqual({
      titulo: "Suelta",
    });
  });

  it("rechaza crear sin título con un error legible y sin crear la acción", async () => {
    const antes = snapshotVault(vaultDir);

    const execution = await ejecutar("crear_objeto", { titulo: "   " });

    expect(execution.isError).toBe(true);
    expect(execution.content).toContain("argumentos inválidos");
    expect(execution.content).toContain("titulo");
    expect(listarAcciones(handle.db)).toEqual([]);
    expect(snapshotVault(vaultDir)).toEqual(antes);
  });
});

describe("editar_objeto", () => {
  it("crea la acción de edición con el resumen del objeto conocido sin tocar el vault", async () => {
    const antes = snapshotVault(vaultDir);
    const cambios = { cuerpo: "otro cuerpo", carpeta: "archivo" };

    const body = await proponer("editar_objeto", { id: BETA, cambios });

    expect(body.accion_propuesta.tipoAccion).toBe("editar_objeto");
    expect(body.accion_propuesta.resumen).toBe("Editar «Beta»");
    expect(obtenerAccion(handle.db, body.accion_propuesta.id)?.payload).toEqual({
      id: BETA,
      cambios,
    });
    expect(snapshotVault(vaultDir)).toEqual(antes);
  });

  it("propone la edición de un id desconocido con un resumen por id", async () => {
    const body = await proponer("editar_objeto", {
      id: FALTANTE,
      cambios: { cuerpo: "da igual" },
    });

    expect(body.accion_propuesta.resumen).toBe(`Editar objeto ${FALTANTE}`);
    expect(obtenerAccion(handle.db, body.accion_propuesta.id)?.payload).toEqual({
      id: FALTANTE,
      cambios: { cuerpo: "da igual" },
    });
  });

  it("rechaza una edición sin cambios con un error legible y sin crear la acción", async () => {
    const antes = snapshotVault(vaultDir);

    const execution = await ejecutar("editar_objeto", { id: BETA, cambios: {} });

    expect(execution.isError).toBe(true);
    expect(execution.content).toContain("no hay cambios que proponer");
    expect(execution.content).toContain(BETA);
    expect(listarAcciones(handle.db)).toEqual([]);
    expect(snapshotVault(vaultDir)).toEqual(antes);
  });
});

describe("borrar_objeto", () => {
  it("propone el borrado con el título en el resumen sin borrar nada", async () => {
    const antes = snapshotVault(vaultDir);

    const body = await proponer("borrar_objeto", { id: BETA });

    expect(body.accion_propuesta.tipoAccion).toBe("borrar_objeto");
    expect(body.accion_propuesta.resumen).toBe("Borrar «Beta»");
    expect(obtenerAccion(handle.db, body.accion_propuesta.id)?.payload).toEqual({ id: BETA });
    expect(snapshotVault(vaultDir)).toEqual(antes);
    expect(createObjectRepository({ vaultDir }).readObject(BETA).ok).toBe(true);
  });

  it("rechaza borrar un objeto desconocido sin crear la acción", async () => {
    const antes = snapshotVault(vaultDir);

    const execution = await ejecutar("borrar_objeto", { id: FALTANTE });

    expect(execution.isError).toBe(true);
    expect(execution.content).toContain("objeto no encontrado");
    expect(execution.content).toContain(FALTANTE);
    expect(listarAcciones(handle.db)).toEqual([]);
    expect(snapshotVault(vaultDir)).toEqual(antes);
  });
});

describe("recordar_dato", () => {
  it("propone guardar el dato sin escribir en la memoria", async () => {
    const args = { clave: "color favorito", contenido: "azul" };

    const body = await proponer("recordar_dato", args);

    expect(body.accion_propuesta.tipoAccion).toBe("guardar_memoria");
    expect(body.accion_propuesta.estado).toBe("pendiente");
    expect(body.accion_propuesta.resumen).toBe("Recordar «color favorito»");
    expect(obtenerAccion(handle.db, body.accion_propuesta.id)?.payload).toEqual(args);
    expect(listarMemorias(handle.db)).toEqual([]);
  });

  it("rechaza un dato sin clave sin crear la acción", async () => {
    const execution = await ejecutar("recordar_dato", { clave: "   ", contenido: "azul" });

    expect(execution.isError).toBe(true);
    expect(execution.content).toContain("argumentos inválidos");
    expect(execution.content).toContain("clave");
    expect(listarAcciones(handle.db)).toEqual([]);
    expect(listarMemorias(handle.db)).toEqual([]);
  });
});

describe("integración con el runtime del agente", () => {
  it("propone una creación con el registro del agente, no toca el vault y al confirmar aparece el objeto", async () => {
    const antes = snapshotVault(vaultDir);
    const client = new MockLLMClient({
      responses: [
        toolTurn([
          toolCall(
            "crear_objeto",
            {
              tipo: "tarea",
              titulo: "Preparar informe",
              atributos: { estado: "pendiente" },
              cuerpo: "con detalle",
            },
            "call-crear",
          ),
        ]),
        finalTurn("He preparado la propuesta de tarea."),
      ],
    });
    const runtime = createAgentRuntime({
      client,
      registry: crearRegistroDelAgente({ db: handle.db, vaultDir }),
    });

    const result = await runtime.run({
      history: [],
      userMessage: "crea una tarea para el informe",
    });

    expect(result.estado).toBe("completado");
    expect(result.toolCallsEjecutados.map((call) => call.name)).toEqual(["crear_objeto"]);
    const messages = toolMessagesAt(client, 1);
    expect(messages).toHaveLength(1);
    const contenido = propuestaSchema.parse(JSON.parse(messages[0]?.content ?? "") as unknown);
    expect(contenido.accion_propuesta.resumen).toBe("Crear tarea «Preparar informe»");
    expect(messages[0]?.content).toContain(contenido.accion_propuesta.id);
    expect(snapshotVault(vaultDir)).toEqual(antes);
    expect(obtenerAccion(handle.db, contenido.accion_propuesta.id)?.estado).toBe("pendiente");

    const aplicada = confirmarAccion({ db: handle.db, vaultDir }, contenido.accion_propuesta.id);

    expect(aplicada.estado).toBe("aplicada");
    const resultado = aplicada.resultado;
    if (
      typeof resultado !== "object" ||
      resultado === null ||
      !("id" in resultado) ||
      typeof (resultado as { id: unknown }).id !== "string"
    ) {
      throw new Error("la acción aplicada no tiene un id de resultado");
    }
    const creado = createObjectRepository({ vaultDir }).readObject(
      (resultado as { id: string }).id,
    );
    expect(creado.ok).toBe(true);
    if (creado.ok) {
      expect(creado.object.title).toBe("Preparar informe");
      expect(creado.object.body).toBe("con detalle");
      expect(creado.object.type).toBe("tarea");
    }
  });

  it("propone un cambio de título y al confirmar se renombra el objeto", async () => {
    const antes = snapshotVault(vaultDir);

    const body = await proponer("editar_objeto", {
      id: BETA,
      cambios: { titulo: "Beta renombrada" },
    });

    expect(body.accion_propuesta.resumen).toBe("Editar «Beta»");
    expect(snapshotVault(vaultDir)).toEqual(antes);

    const aplicada = confirmarAccion({ db: handle.db, vaultDir }, body.accion_propuesta.id);

    expect(aplicada.estado).toBe("aplicada");
    expect(existsSync(join(vaultDir, "proyectos", "beta.md"))).toBe(false);
    const renombrado = createObjectRepository({ vaultDir }).readObject(BETA);
    expect(renombrado.ok).toBe(true);
    if (renombrado.ok) {
      expect(renombrado.object.title).toBe("Beta renombrada");
      expect(renombrado.object.path).not.toBe("proyectos/beta.md");
      expect(renombrado.object.body).toContain("presupuesto");
    }
  });

  it("propone recordar un dato y solo lo guarda al confirmar la propuesta", async () => {
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
      ],
    });
    const runtime = createAgentRuntime({
      client,
      registry: crearRegistroDelAgente({ db: handle.db, vaultDir }),
    });

    const result = await runtime.run({
      history: [],
      userMessage: "recuerda que mi color favorito es azul",
    });

    expect(result.estado).toBe("completado");
    expect(result.toolCallsEjecutados.map((call) => call.name)).toEqual(["recordar_dato"]);
    const messages = toolMessagesAt(client, 1);
    expect(messages).toHaveLength(1);
    const contenido = propuestaSchema.parse(JSON.parse(messages[0]?.content ?? "") as unknown);
    expect(contenido.accion_propuesta.tipoAccion).toBe("guardar_memoria");
    expect(contenido.accion_propuesta.resumen).toBe("Recordar «color favorito»");
    expect(listarMemorias(handle.db)).toEqual([]);

    const aplicada = confirmarAccion({ db: handle.db, vaultDir }, contenido.accion_propuesta.id);

    expect(aplicada.estado).toBe("aplicada");
    const [memoria] = listarMemorias(handle.db);
    expect(memoria?.clave).toBe("color favorito");
    expect(memoria?.contenido).toBe("azul");
    expect(aplicada.resultado).toEqual({ id: memoria?.id });
  });
});
