import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LlmError } from "./errors.js";
import { ToolRegistry } from "./tools.js";
import type { ToolCall } from "./types.js";

const toolCall = (name: string, args: Record<string, unknown>, id = "call-1"): ToolCall => ({
  id,
  name,
  arguments: args,
});

describe("ToolRegistry", () => {
  it("registra una herramienta y la expone como definición con JSON Schema", () => {
    const registry = new ToolRegistry();
    registry.registerTool({
      name: "buscar",
      description: "busca objetos del vault",
      schema: z.object({
        consulta: z.string().min(1),
        limite: z.number().int().optional(),
      }),
      handler: () => "resultado",
    });

    const definitions = registry.definitions();

    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toMatchObject({
      name: "buscar",
      description: "busca objetos del vault",
      parameters: {
        type: "object",
        properties: {
          consulta: { type: "string" },
          limite: { type: "integer" },
        },
        required: ["consulta"],
      },
    });
    expect(definitions[0]?.parameters.$schema).toBeUndefined();
  });

  it("rechaza herramientas con nombre duplicado", () => {
    const registry = new ToolRegistry();
    const spec = {
      name: "leer",
      description: "lee",
      schema: z.object({}),
      handler: () => "",
    };
    registry.registerTool(spec);

    expect(() => registry.registerTool(spec)).toThrow(LlmError);
    expect(() => registry.registerTool(spec)).toThrow(/ya está registrada/);
  });

  it("ejecuta el handler con los argumentos validados y serializa objetos", async () => {
    const registry = new ToolRegistry();
    registry.registerTool({
      name: "leer",
      description: "lee un objeto",
      schema: z.object({ id: z.string() }),
      handler: ({ id }) => ({ id, titulo: `Título ${id}` }),
    });

    await expect(registry.execute(toolCall("leer", { id: "abc" }))).resolves.toEqual({
      toolCallId: "call-1",
      name: "leer",
      content: JSON.stringify({ id: "abc", titulo: "Título abc" }),
      isError: false,
    });
  });

  it("devuelve los resultados de texto tal cual y espera handlers asíncronos", async () => {
    const registry = new ToolRegistry();
    registry.registerTool({
      name: "saludar",
      description: "saluda",
      schema: z.object({ nombre: z.string() }),
      handler: async ({ nombre }) => `hola ${nombre}`,
    });

    const execution = await registry.execute(toolCall("saludar", { nombre: "Ana" }));

    expect(execution.content).toBe("hola Ana");
    expect(execution.isError).toBe(false);
  });

  it("devuelve un error legible al modelo cuando los argumentos no validan", async () => {
    let calls = 0;
    const registry = new ToolRegistry();
    registry.registerTool({
      name: "leer",
      description: "lee un objeto",
      schema: z.object({ id: z.string().min(1) }),
      handler: () => {
        calls += 1;
        return "no debería ejecutarse";
      },
    });

    const execution = await registry.execute(toolCall("leer", { id: 123 }));

    expect(execution.isError).toBe(true);
    expect(execution.content).toMatch(/argumentos inválidos/);
    expect(execution.content).toContain("id");
    expect(calls).toBe(0);
  });

  it("devuelve un error legible al modelo para una herramienta desconocida", async () => {
    const registry = new ToolRegistry();

    const execution = await registry.execute(toolCall("no_existe", {}));

    expect(execution).toEqual({
      toolCallId: "call-1",
      name: "no_existe",
      content: 'herramienta desconocida: "no_existe"',
      isError: true,
    });
  });

  it("captura los errores del handler como resultado de error", async () => {
    const registry = new ToolRegistry();
    registry.registerTool({
      name: "romper",
      description: "siempre falla",
      schema: z.object({}),
      handler: () => {
        throw new Error("fuente rota");
      },
    });

    const execution = await registry.execute(toolCall("romper", {}));

    expect(execution.isError).toBe(true);
    expect(execution.content).toBe('la herramienta "romper" falló: fuente rota');
  });

  it("convierte esquemas inválidos de Zod en un error de registro", () => {
    const registry = new ToolRegistry();

    expect(() =>
      registry.registerTool({
        name: "rara",
        description: "esquema con transformación",
        schema: z.string().transform((value) => value.length),
        handler: () => "no llega",
      }),
    ).toThrow(/no se pudo convertir a JSON Schema/);
  });
});
