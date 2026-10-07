import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrapVault, newUlid, writeObjectFile } from "@migite/core";
import type { ObjectFilters, SearchObjectsOptions } from "../src/index.js";

export const BUILD_LIMIT_MS = 30 * 60 * 1000;
export const SEARCH_P95_LIMIT_MS = 500;
export const LIST_P95_LIMIT_MS = 300;
export const WATCHER_LIMIT_MS = 30 * 1000;

const WORDS = [
  "búsqueda",
  "índice",
  "reunión",
  "código",
  "diseño",
  "migración",
  "informe",
  "revisión",
  "equipo",
  "cliente",
  "sistema",
  "usuario",
  "documento",
  "objetivo",
  "métrica",
  "prueba",
  "calendario",
  "archivo",
  "proyecto",
  "sesión",
  "análisis",
  "depuración",
  "novedad",
  "jornada",
  "campaña",
  "presupuesto",
  "factura",
  "contrato",
  "entrevista",
  "apunte",
  "resumen",
  "decisión",
  "riesgo",
  "entrega",
  "sprint",
  "incidencia",
  "mejora",
  "rendimiento",
  "seguridad",
  "acceso",
  "permiso",
  "notificación",
  "recordatorio",
  "evento",
  "tarea",
  "carpeta",
  "etiqueta",
  "enlace",
  "plantilla",
  "borrador",
] as const;

const TAGS = [
  "trabajo",
  "personal",
  "urgente",
  "idea",
  "archivo",
  "revision",
  "proyecto",
  "salud",
  "finanzas",
  "viaje",
  "estudio",
  "hogar",
] as const;

export type BenchConfig = {
  readonly notes: number;
  readonly folders: number;
  readonly searches: number;
  readonly listSamples: number;
  readonly keep: boolean;
};

export type PreparedQuery = {
  readonly label: string;
  readonly options: SearchObjectsOptions;
};

export const parseArgs = (argv: readonly string[]): BenchConfig => {
  let notes = 50_000;
  let searches = 50;
  const keep = argv.includes("--keep");
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    if (argv[index] === "--notes" && value !== undefined) {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed > 0) {
        notes = parsed;
      }
      index += 1;
    }
    if (argv[index] === "--searches" && value !== undefined) {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed > 0) {
        searches = parsed;
      }
      index += 1;
    }
  }
  return {
    notes,
    folders: Math.max(1, Math.min(50, Math.round(notes / 1000))),
    searches,
    listSamples: 20,
    keep,
  };
};

const word = (index: number): string => WORDS[index % WORDS.length] ?? "nota";

const titleOf = (index: number): string => `${word(index)} ${word(index * 7 + 3)} ${index}`;

const bodyOf = (index: number): string => {
  const parts: string[] = [];
  const count = 18 + (index % 23);
  for (let offset = 0; offset < count; offset += 1) {
    parts.push(word(index * 11 + offset * 5));
  }
  if (index % 8 === 0) {
    parts.push(`[[${titleOf(index * 13 + 7)}]]`);
  }
  return parts.join(" ");
};

export const generateVault = (config: BenchConfig, vaultDir: string): void => {
  bootstrapVault(vaultDir);
  const base = Date.UTC(2026, 9, 1);
  for (let index = 0; index < config.notes; index += 1) {
    const folder = `carpeta-${String(index % config.folders).padStart(3, "0")}`;
    mkdirSync(join(vaultDir, folder), { recursive: true });
    const updated = new Date(base - index * 37_000).toISOString();
    const tags = [
      ...new Set([
        TAGS[index % TAGS.length] ?? "trabajo",
        TAGS[(index * 5 + 1) % TAGS.length] ?? "trabajo",
      ]),
    ];
    const text = writeObjectFile(
      {
        id: newUlid(),
        type: "nota",
        title: titleOf(index),
        created: updated,
        updated,
        links: [],
        attributes: { etiquetas: tags },
      },
      bodyOf(index),
    );
    writeFileSync(join(vaultDir, folder, `${index}.md`), text, "utf8");
  }
};

const filterSamples = (folders: number): ObjectFilters[] => [
  { tipo: "nota" },
  { carpeta: `carpeta-${String(0).padStart(3, "0")}` },
  { tag: "urgente" },
  { desde: new Date(Date.UTC(2026, 8, 1)).toISOString() },
  { tipo: "nota", tag: "trabajo", desde: new Date(Date.UTC(2026, 8, 15)).toISOString() },
  {
    carpeta: `carpeta-${String(folders - 1).padStart(3, "0")}`,
    hasta: new Date(Date.UTC(2026, 8, 20)).toISOString(),
  },
];

export const prepareQueries = (config: BenchConfig): PreparedQuery[] => {
  const filters = filterSamples(config.folders);
  const queries: PreparedQuery[] = [];
  for (let index = 0; index < config.searches; index += 1) {
    const first = word(index * 3);
    const second = word(index * 7 + 1);
    const prefix = first.slice(0, 3 + (index % 4));
    const suffix = second.slice(0, 4 + (index % 3));
    switch (index % 5) {
      case 0:
        queries.push({ label: `prefijo "${prefix}"`, options: { query: prefix } });
        break;
      case 1:
        queries.push({
          label: `multi "${prefix} ${suffix}"`,
          options: { query: `${prefix} ${suffix}` },
        });
        break;
      case 2:
        queries.push({
          label: `prefijo "${prefix}" + filtro`,
          options: { query: prefix, filters: filters[index % filters.length] },
        });
        break;
      case 3:
        queries.push({
          label: `prefijo "${prefix}" + ruido`,
          options: { query: `"${prefix}" OR ${suffix}` },
        });
        break;
      default:
        queries.push({
          label: `prefijo "${prefix}" + tipo`,
          options: { query: prefix, filters: { tipo: "nota" } },
        });
        break;
    }
  }
  return queries;
};

export const percentile = (values: readonly number[], ratio: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
};

export const time = (action: () => void): number => {
  const startedAt = performance.now();
  action();
  return performance.now() - startedAt;
};

export const formatMs = (milliseconds: number): string =>
  milliseconds >= 1000 ? `${(milliseconds / 1000).toFixed(2)} s` : `${milliseconds.toFixed(1)} ms`;

export const formatMb = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export const verdict = (ok: boolean): string => (ok ? "OK" : "FALLA");
