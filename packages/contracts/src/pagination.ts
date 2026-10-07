import { z } from "zod";

export const LIMITE_MIN = 1;

export const LIMITE_MAX = 500;

export const limiteSchema = z.number().int().min(LIMITE_MIN).max(LIMITE_MAX);

export const paginationSchema = z.object({
  limite: limiteSchema.optional(),
  cursor: z.string().optional(),
});

export type Pagination = z.infer<typeof paginationSchema>;
