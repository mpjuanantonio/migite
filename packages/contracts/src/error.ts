import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);

export const errorBodySchema = z.object({
  error: z.object({
    codigo: nonEmptyText,
    mensaje: nonEmptyText,
  }),
});

export type ErrorBody = z.infer<typeof errorBodySchema>;
