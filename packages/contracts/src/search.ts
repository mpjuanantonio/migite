import { z } from "zod";
import { LIMITE_MAX, LIMITE_MIN } from "./pagination.js";

export const MAX_ATRIBUTOS_FILTRO = 16;

export const MAX_VALORES_ATRIBUTO = 32;

export const MAX_RANGOS_ATRIBUTO = 8;

export const MAX_CLAVE_FILTRO = 64;

export const MAX_VALOR_FILTRO = 512;

const ATRIBUTO_PREFIX = "atributo.";

const RANGO_PREFIX = "rango.";

const RANGO_DESDE_SUFFIX = ".desde";

const RANGO_HASTA_SUFFIX = ".hasta";

type RangoAtributo = {
  clave: string;
  desde?: string;
  hasta?: string;
};

const claveValida = (clave: string): boolean =>
  clave.length > 0 && clave.length <= MAX_CLAVE_FILTRO && !clave.includes(".");

const valoresDe = (value: unknown): string[] | undefined => {
  if (typeof value === "string") {
    return [value];
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items: unknown[] = value;
  const values: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") {
      return undefined;
    }
    values.push(item);
  }
  return values;
};

const baseSearchParamsSchema = z
  .object({
    q: z.string().optional(),
    tipo: z.string().optional(),
    carpeta: z.string().optional(),
    tag: z.string().optional(),
    desde: z.string().optional(),
    hasta: z.string().optional(),
    enlazadoA: z.string().max(MAX_CLAVE_FILTRO).optional(),
    limite: z.coerce.number().int().min(LIMITE_MIN).max(LIMITE_MAX).optional(),
    cursor: z.string().optional(),
  })
  .loose();

export const searchParamsSchema = baseSearchParamsSchema.transform((raw, ctx) => {
  const { q, tipo, carpeta, tag, desde, hasta, enlazadoA, limite, cursor } = raw;
  const atributos: Record<string, string[]> = {};
  const rangos = new Map<string, RangoAtributo>();

  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith(ATRIBUTO_PREFIX)) {
      const clave = key.slice(ATRIBUTO_PREFIX.length);
      if (!claveValida(clave)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `clave de atributo inválida: "${clave}"`,
        });
        continue;
      }
      const values = valoresDe(value);
      if (values === undefined || values.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "el filtro debe indicar al menos un valor",
        });
        continue;
      }
      if (values.length > MAX_VALORES_ATRIBUTO) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `máximo ${MAX_VALORES_ATRIBUTO} valores por atributo`,
        });
        continue;
      }
      if (values.some((item) => item.length > MAX_VALOR_FILTRO)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `cada valor admite ${MAX_VALOR_FILTRO} caracteres como máximo`,
        });
        continue;
      }
      if (!(clave in atributos) && Object.keys(atributos).length >= MAX_ATRIBUTOS_FILTRO) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `máximo ${MAX_ATRIBUTOS_FILTRO} atributos en el filtro`,
        });
        continue;
      }
      atributos[clave] = values;
      continue;
    }
    if (!key.startsWith(RANGO_PREFIX)) {
      continue;
    }
    const rest = key.slice(RANGO_PREFIX.length);
    const suffix = rest.endsWith(RANGO_DESDE_SUFFIX)
      ? RANGO_DESDE_SUFFIX
      : rest.endsWith(RANGO_HASTA_SUFFIX)
        ? RANGO_HASTA_SUFFIX
        : undefined;
    if (suffix === undefined) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: "el rango debe ser rango.<clave>.desde o rango.<clave>.hasta",
      });
      continue;
    }
    const clave = rest.slice(0, -suffix.length);
    if (!claveValida(clave)) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `clave de rango inválida: "${clave}"`,
      });
      continue;
    }
    if (typeof value !== "string") {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: "el rango no admite valores repetidos",
      });
      continue;
    }
    if (value.length > MAX_VALOR_FILTRO) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `el rango admite ${MAX_VALOR_FILTRO} caracteres como máximo`,
      });
      continue;
    }
    const existing = rangos.get(clave);
    if (existing === undefined && rangos.size >= MAX_RANGOS_ATRIBUTO) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `máximo ${MAX_RANGOS_ATRIBUTO} rangos de atributo`,
      });
      continue;
    }
    const rango = existing ?? { clave };
    if (suffix === RANGO_DESDE_SUFFIX) {
      if (rango.desde !== undefined) {
        ctx.addIssue({ code: "custom", path: [key], message: "parámetro repetido" });
        continue;
      }
      rango.desde = value;
    } else {
      if (rango.hasta !== undefined) {
        ctx.addIssue({ code: "custom", path: [key], message: "parámetro repetido" });
        continue;
      }
      rango.hasta = value;
    }
    rangos.set(clave, rango);
  }

  return {
    q,
    tipo,
    carpeta,
    tag,
    desde,
    hasta,
    enlazadoA,
    limite,
    cursor,
    ...(Object.keys(atributos).length === 0 ? {} : { atributos }),
    ...(rangos.size === 0 ? {} : { rangoAtributo: [...rangos.values()] }),
  };
});

export type SearchParams = z.infer<typeof searchParamsSchema>;

export const searchResultItemSchema = z.object({
  id: z.string(),
  tipo: z.string(),
  titulo: z.string(),
  ruta: z.string(),
  actualizado: z.string(),
  fragmento: z.string().optional(),
});

export type SearchResultItem = z.infer<typeof searchResultItemSchema>;

export const searchResultsSchema = z.object({
  resultados: z.array(searchResultItemSchema),
  siguienteCursor: z.string().nullable(),
});

export type SearchResults = z.infer<typeof searchResultsSchema>;
