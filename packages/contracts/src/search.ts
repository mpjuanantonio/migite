import { z } from "zod";
import { LIMITE_MAX, LIMITE_MIN } from "./pagination.js";

export const searchParamsSchema = z.object({
  q: z.string().optional(),
  tipo: z.string().optional(),
  carpeta: z.string().optional(),
  tag: z.string().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  limite: z.coerce.number().int().min(LIMITE_MIN).max(LIMITE_MAX).optional(),
  cursor: z.string().optional(),
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
