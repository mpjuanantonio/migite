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
