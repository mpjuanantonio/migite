import { type ZodType, z } from "zod";
import { describeError, LlmError } from "./errors.js";
import type { JsonObject, JsonValue, ToolCall, ToolDefinition } from "./types.js";

export type ToolHandlerResult = string | JsonValue | Promise<string | JsonValue>;

export interface ToolSpec<S extends ZodType = ZodType> {
  readonly name: string;
  readonly description: string;
  readonly schema: S;
  readonly handler: (args: z.output<S>) => ToolHandlerResult;
}

export interface ToolExecution {
  readonly toolCallId: string;
  readonly name: string;
  readonly content: string;
  readonly isError: boolean;
}

interface RegisteredTool {
  readonly definition: ToolDefinition;
  readonly schema: ZodType;
  readonly handler: (args: unknown) => ToolHandlerResult;
}

const toJsonSchema = (schema: ZodType, toolName: string): JsonObject => {
  let raw: unknown;
  try {
    raw = z.toJSONSchema(schema, { target: "draft-7" });
  } catch (cause) {
    throw new LlmError(
      `no se pudo convertir a JSON Schema el esquema de la herramienta "${toolName}"`,
      { cause },
    );
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new LlmError(
      `el esquema de la herramienta "${toolName}" no produjo un objeto JSON Schema`,
    );
  }
  const { $schema: _ignored, ...parameters } = { ...(raw as JsonObject) };
  return parameters;
};

const formatIssues = (error: z.ZodError): string =>
  error.issues
    .map((issue) => {
      const path = issue.path.map((segment) => String(segment)).join(".");
      return path === "" ? issue.message : `${path}: ${issue.message}`;
    })
    .join("; ");

const serializeResult = (result: JsonValue): string =>
  typeof result === "string" ? result : (JSON.stringify(result) ?? "null");

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  registerTool<S extends ZodType>(spec: ToolSpec<S>): void {
    if (this.tools.has(spec.name)) {
      throw new LlmError(`la herramienta "${spec.name}" ya está registrada`);
    }
    this.tools.set(spec.name, {
      definition: {
        name: spec.name,
        description: spec.description,
        parameters: toJsonSchema(spec.schema, spec.name),
      },
      schema: spec.schema,
      handler: (args) => spec.handler(args as z.output<S>),
    });
  }

  definitions(): ToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.definition);
  }

  async execute(call: ToolCall): Promise<ToolExecution> {
    const tool = this.tools.get(call.name);
    if (tool === undefined) {
      return {
        toolCallId: call.id,
        name: call.name,
        content: `herramienta desconocida: "${call.name}"`,
        isError: true,
      };
    }

    const parsed = tool.schema.safeParse(call.arguments);
    if (!parsed.success) {
      return {
        toolCallId: call.id,
        name: call.name,
        content: `argumentos inválidos para la herramienta "${call.name}": ${formatIssues(parsed.error)}`,
        isError: true,
      };
    }

    try {
      const result = await tool.handler(parsed.data);
      return {
        toolCallId: call.id,
        name: call.name,
        content: serializeResult(result),
        isError: false,
      };
    } catch (error) {
      return {
        toolCallId: call.id,
        name: call.name,
        content: `la herramienta "${call.name}" falló: ${describeError(error)}`,
        isError: true,
      };
    }
  }
}
