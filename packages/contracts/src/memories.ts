import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);

export const memoriaSchema = z.strictObject({
  id: z.string(),
  clave: z.string(),
  contenido: z.string(),
  actualizada: z.string(),
});

export type Memoria = z.infer<typeof memoriaSchema>;

export const memoriasListSchema = z.strictObject({
  memorias: z.array(memoriaSchema),
});

export type MemoriasList = z.infer<typeof memoriasListSchema>;

export const actualizarMemoriaBodySchema = z.strictObject({
  contenido: nonEmptyText.max(4000),
});

export type ActualizarMemoriaBody = z.infer<typeof actualizarMemoriaBodySchema>;
