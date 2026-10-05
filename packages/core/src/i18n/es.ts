import type { TranslationKey } from "./en.js";

export const es = {
  "app.nombre": "Migite",
  "aviso.claveApiAusente":
    "Aviso: no está definida la variable de entorno {variable} (clave API). La app funciona, pero el agente de IA quedará inoperativo.",
  "error.configInvalida": "Configuración inválida en {path}",
  "error.generico": "Se ha producido un error inesperado",
  "web.contenedorNoEncontrado": "No se encontro el contenedor #root",
  "web.estadoM0": "Monorepo en preparacion (M0).",
  "web.lema": "Tu mano derecha, siempre para lo que necesites.",
  "web.titulo": "Migite 0.1",
} satisfies Record<TranslationKey, string>;
