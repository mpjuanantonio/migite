export const en = {
  "app.nombre": "Migite",
  "aviso.claveApiAusente":
    "Warning: the environment variable {variable} (API key) is not set. The app works, but the AI agent will be unavailable.",
  "error.configInvalida": "Invalid configuration in {path}",
  "error.generico": "An unexpected error occurred",
  "web.contenedorNoEncontrado": "Root container #root not found",
  "web.estadoM0": "Monorepo in preparation (M0).",
  "web.lema": "Your right hand, for whatever you need.",
  "web.titulo": "Migite 0.1",
};

export type TranslationKey = keyof typeof en;
