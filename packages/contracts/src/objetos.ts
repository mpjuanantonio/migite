import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);

const WIKILINK_PATTERN = /^\[\[[^[\]]+\]\]$/;

const MAX_OBJECT_LINKS = 100;

const wikilinkText = z.string().trim().regex(WIKILINK_PATTERN);

export const degradationReasonSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("unknownType"),
    type: z.string(),
  }),
  z.object({
    kind: z.literal("brokenType"),
    type: z.string(),
    problems: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("invalidAttribute"),
    key: z.string(),
    problems: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("unreadableFrontmatter"),
    problems: z.array(z.string()),
  }),
]);

export type DegradationReasonPayload = z.infer<typeof degradationReasonSchema>;

export const objectPayloadSchema = z.object({
  id: z.string(),
  tipo: z.string(),
  titulo: z.string(),
  ruta: z.string(),
  carpeta: z.string(),
  creado: z.string(),
  actualizado: z.string(),
  atributos: z.record(z.string(), z.unknown()),
  cuerpo: z.string(),
  enlaces: z.array(z.string()),
  degraded: z.array(degradationReasonSchema),
});

export type ObjectPayload = z.infer<typeof objectPayloadSchema>;

export const LIMITE_MAX_ARBOL = 2000;

export const arbolObjetosParamsSchema = z.object({
  tipo: nonEmptyText.optional(),
  limite: z.coerce.number().int().min(1).max(LIMITE_MAX_ARBOL).optional(),
});

export type ArbolObjetosParams = z.infer<typeof arbolObjetosParamsSchema>;

export const arbolObjetoNodeSchema = z.object({
  id: z.string(),
  tipo: z.string(),
  titulo: z.string(),
  ruta: z.string(),
  carpeta: z.string(),
  actualizado: z.string(),
});

export type ArbolObjetoNode = z.infer<typeof arbolObjetoNodeSchema>;

export const arbolObjetosSchema = z.object({
  nodos: z.array(arbolObjetoNodeSchema),
});

export type ArbolObjetos = z.infer<typeof arbolObjetosSchema>;

const objectBodyShape = {
  tipo: nonEmptyText.optional(),
  titulo: nonEmptyText,
  atributos: z.record(z.string(), z.unknown()).optional(),
  cuerpo: z.string().optional(),
  carpeta: z.string().optional(),
};

export const createObjectBodySchema = z.strictObject({
  ...objectBodyShape,
  enlaces: z.array(wikilinkText).max(MAX_OBJECT_LINKS).optional(),
});

export type CreateObjectBody = z.infer<typeof createObjectBodySchema>;

export const patchObjectBodySchema = z.strictObject(objectBodyShape).partial();

export type PatchObjectBody = z.infer<typeof patchObjectBodySchema>;

export const renameObjectBodySchema = z.strictObject({
  nuevoTitulo: nonEmptyText,
});

export type RenameObjectBody = z.infer<typeof renameObjectBodySchema>;

export const enlaceEntranteSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  ruta: z.string(),
  contexto: z.enum(["body", "frontmatter"]),
});

export type EnlaceEntrante = z.infer<typeof enlaceEntranteSchema>;

export const enlacesEntrantesSchema = z.object({
  entrantes: z.array(enlaceEntranteSchema),
});

export type EnlacesEntrantes = z.infer<typeof enlacesEntrantesSchema>;

export const renameReportSchema = z.object({
  objeto: objectPayloadSchema,
  informe: z.object({
    reescritos: z.array(z.string()),
    omitidos: z.array(
      z.object({
        path: z.string(),
        problems: z.array(z.string()),
      }),
    ),
    enlacesSinResolver: z.array(
      z.object({
        path: z.string(),
        link: z.string(),
      }),
    ),
  }),
});

export type RenameReport = z.infer<typeof renameReportSchema>;
