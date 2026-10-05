import { z } from "zod";
import { locales } from "../i18n/index.js";

export const ROLES = ["conversar", "recuperar", "resumir", "embeddings"] as const;

export type LlmRole = (typeof ROLES)[number];

export const PATRON_VARIABLE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const textoNoVacio = z.string().trim().min(1, "no puede estar vacío");

const nombreVariable = z.string().regex(PATRON_VARIABLE, "nombre de variable de entorno inválido");

const esZonaHorariaValida = (zonaHoraria: string): boolean => {
  try {
    const formateador = new Intl.DateTimeFormat("en-US", { timeZone: zonaHoraria });
    return formateador.resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
};

const zonaHoraria = textoNoVacio.refine(esZonaHorariaValida, "zona horaria IANA no reconocida");

const urlHttp = textoNoVacio.pipe(
  z.url({ protocol: /^https?$/, error: "debe ser una URL http o https válida" }),
);

export const proveedorSchema = z.strictObject({
  id: textoNoVacio,
  baseUrl: urlHttp,
  apiKeyEnv: nombreVariable,
});

export const asignacionRolSchema = z.strictObject({
  proveedor: textoNoVacio,
  modelo: textoNoVacio,
});

const formaRoles = {
  conversar: asignacionRolSchema,
  recuperar: asignacionRolSchema,
  resumir: asignacionRolSchema,
  embeddings: asignacionRolSchema,
} satisfies Record<LlmRole, typeof asignacionRolSchema>;

const roles = z.strictObject(formaRoles);

export const appSchema = z.strictObject({
  rutas: z.strictObject({
    vault: textoNoVacio,
    indice: textoNoVacio,
  }),
  zonaHoraria,
  idioma: z.enum(locales),
});

export const llmSchema = z
  .strictObject({
    proveedores: z.array(proveedorSchema).min(1, "debe declarar al menos un proveedor"),
    roles,
  })
  .superRefine((configuracion, contexto) => {
    const ids = configuracion.proveedores.map((proveedor) => proveedor.id);
    const declarados = new Set<string>();

    for (const [indice, id] of ids.entries()) {
      if (declarados.has(id)) {
        contexto.addIssue({
          code: "custom",
          path: ["proveedores", indice, "id"],
          message: `id de proveedor duplicado: ${id}`,
        });
      }
      declarados.add(id);
    }

    for (const rol of ROLES) {
      const asignacion = configuracion.roles[rol];
      if (!declarados.has(asignacion.proveedor)) {
        contexto.addIssue({
          code: "custom",
          path: ["roles", rol, "proveedor"],
          message: `el proveedor ${asignacion.proveedor} no está declarado en proveedores`,
        });
      }
    }
  });

export type AppConfig = z.infer<typeof appSchema>;

export type LlmConfig = z.infer<typeof llmSchema>;

export type Proveedor = z.infer<typeof proveedorSchema>;

export type AsignacionRol = z.infer<typeof asignacionRolSchema>;
