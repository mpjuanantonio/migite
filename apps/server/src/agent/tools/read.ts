import {
  type AttributeDefinition,
  createObjectRepository,
  FIELD_TYPE_WIRES,
  type ObjectRepository,
  type TypeDefinition,
} from "@migite/core";
import {
  type IndexDatabase,
  listObjectsIndexed,
  type ObjectFilters,
  searchObjects,
} from "@migite/index";
import type { JsonObject, JsonValue, ToolRegistry } from "@migite/llm";
import { z } from "zod";

export type HerramientasLecturaDeps = {
  readonly db: IndexDatabase;
  readonly vaultDir: string;
  readonly timeZone?: string;
};

export const LIMITE_BUSQUEDA_CONOCIMIENTO = 10;

export const LIMITE_LISTADO_OBJETOS = 20;

export const MAX_LIMITE_LISTADO_OBJETOS = 100;

export const DELIMITADOR_DATOS_VAULT_INICIO = "<datos_vault>";

export const DELIMITADOR_DATOS_VAULT_FIN = "</datos_vault>";

// Espejo del delimitador de @migite/llm (no reexportado): los campos de texto del vault
// viajan marcados como datos para que el modelo no los interprete como instrucciones.
const datoDeVault = (valor: string): string =>
  `${DELIMITADOR_DATOS_VAULT_INICIO}${valor}${DELIMITADOR_DATOS_VAULT_FIN}`;

const MAX_QUERY_LENGTH = 512;

const jsonValue = (value: unknown): JsonValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => jsonValue(item));
  }
  if (typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) {
        result[key] = jsonValue(item);
      }
    }
    return result;
  }
  return value === undefined ? null : String(value);
};

const jsonObject = (record: Readonly<Record<string, unknown>>): JsonObject => {
  const result: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      result[key] = jsonValue(value);
    }
  }
  return result;
};

const cita = (row: {
  readonly id: string;
  readonly titulo: string;
  readonly ruta: string;
}): string => `«${row.titulo}» (${row.ruta}) — id ${row.id}`;

const filtrosSchema = z.object({
  tipo: z.string().trim().min(1).optional(),
  carpeta: z.string().trim().min(1).optional(),
  tag: z.string().trim().min(1).optional(),
});

const buscarConocimientoSchema = z.object({
  query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
  filtros: filtrosSchema.optional(),
});

const obtenerObjetoSchema = z.object({
  id_o_titulo: z.string().trim().min(1),
});

const listarObjetosSchema = z.object({
  tipo: z.string().trim().min(1).optional(),
  carpeta: z.string().trim().min(1).optional(),
  tag: z.string().trim().min(1).optional(),
  limite: z.number().int().min(1).max(MAX_LIMITE_LISTADO_OBJETOS).optional(),
});

const listarTiposSchema = z.object({});

const inventarioDeAtributo = (attribute: AttributeDefinition): JsonObject => ({
  id: attribute.id,
  nombre: attribute.name,
  tipo: FIELD_TYPE_WIRES[attribute.type],
  obligatorio: attribute.required,
  ...(attribute.options === undefined ? {} : { opciones: [...attribute.options] }),
});

const inventarioDeTipo = (definition: TypeDefinition): JsonObject => ({
  id: definition.id,
  nombre: definition.name,
  ...(definition.description === undefined ? {} : { descripcion: definition.description }),
  atributos: definition.attributes.map(inventarioDeAtributo),
});

export const registrarHerramientasDeLectura = (
  registry: ToolRegistry,
  deps: HerramientasLecturaDeps,
): void => {
  const repositorio = (): ObjectRepository =>
    createObjectRepository({
      vaultDir: deps.vaultDir,
      ...(deps.timeZone === undefined ? {} : { timeZone: deps.timeZone }),
    });

  const buscar = ({ query, filtros }: z.output<typeof buscarConocimientoSchema>): JsonValue => {
    const rows = searchObjects(deps.db, {
      query,
      ...(filtros === undefined ? {} : { filters: filtros }),
      limit: LIMITE_BUSQUEDA_CONOCIMIENTO,
    });
    return {
      resultados: rows.map((row) => ({
        id: row.id,
        tipo: row.tipo,
        titulo: datoDeVault(row.titulo),
        ruta: datoDeVault(row.ruta),
        actualizado: row.actualizado,
        ...(row.snippet === undefined ? {} : { fragmento: datoDeVault(row.snippet) }),
        fuente: cita(row),
      })),
      ...(rows.length === 0 ? { mensaje: `sin resultados para «${query}»` } : {}),
    };
  };

  const obtener = ({ id_o_titulo }: z.output<typeof obtenerObjetoSchema>): JsonValue => {
    const result = repositorio().readObject(id_o_titulo);
    if (!result.ok) {
      return {
        titulo: datoDeVault(result.degraded.title),
        ruta: datoDeVault(result.path),
        atributos: jsonObject(result.degraded.attributes),
        cuerpo: datoDeVault(result.degraded.body),
        degradado: {
          razones: [{ kind: "unreadableFrontmatter", problems: [...result.problems] }],
        },
      };
    }
    const object = result.object;
    return {
      id: object.id,
      tipo: object.type,
      titulo: datoDeVault(object.title),
      ruta: datoDeVault(object.path),
      carpeta: object.folder,
      creado: object.created,
      actualizado: object.updated,
      atributos: jsonObject(object.attributes),
      cuerpo: datoDeVault(object.body),
      enlaces: [...object.links],
      ...(object.degraded.length === 0
        ? {}
        : { degradado: { razones: object.degraded.map((reason) => jsonValue(reason)) } }),
    };
  };

  const listar = ({
    tipo,
    carpeta,
    tag,
    limite,
  }: z.output<typeof listarObjetosSchema>): JsonValue => {
    const filters: ObjectFilters = {
      ...(tipo === undefined ? {} : { tipo }),
      ...(carpeta === undefined ? {} : { carpeta }),
      ...(tag === undefined ? {} : { tag }),
    };
    const rows = listObjectsIndexed(deps.db, {
      filters,
      limit: limite ?? LIMITE_LISTADO_OBJETOS,
    });
    return {
      objetos: rows.map((row) => ({
        id: row.id,
        tipo: row.tipo,
        titulo: datoDeVault(row.titulo),
        ruta: datoDeVault(row.ruta),
        actualizado: row.actualizado,
      })),
      ...(rows.length === 0 ? { mensaje: "no hay objetos que cumplan los filtros" } : {}),
    };
  };

  const listarTipos = (): JsonValue => ({
    tipos: repositorio().listTypes().map(inventarioDeTipo),
  });

  registry.registerTool({
    name: "buscar_conocimiento",
    description:
      "Busca en el conocimiento del vault por texto libre, con filtros opcionales por tipo, carpeta o etiqueta. Devuelve fragmentos con su fuente (id, título y ruta) para citar el origen.",
    schema: buscarConocimientoSchema,
    handler: buscar,
  });
  registry.registerTool({
    name: "obtener_objeto",
    description:
      "Lee un objeto completo del vault por su id o su título: atributos, cuerpo, enlaces y motivo de degradación si lo hubiera.",
    schema: obtenerObjetoSchema,
    handler: obtener,
  });
  registry.registerTool({
    name: "listar_objetos",
    description:
      "Lista objetos del vault con filtros opcionales por tipo, carpeta o etiqueta. Devuelve un listado ligero con id, tipo, título, ruta y fecha de actualización.",
    schema: listarObjetosSchema,
    handler: listar,
  });
  registry.registerTool({
    name: "listar_tipos",
    description:
      "Lista el inventario de tipos de objeto del vault (nativos y personalizados) con sus atributos, tipo de dato, obligatoriedad y opciones.",
    schema: listarTiposSchema,
    handler: listarTipos,
  });
};
