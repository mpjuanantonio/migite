import type { LlmConfig } from "./schema.js";

export const clavesApiAusentes = (
  llm: LlmConfig,
  env: Readonly<Record<string, string | undefined>> = process.env,
): readonly string[] => {
  const vistas = new Set<string>();
  const ausentes: string[] = [];

  for (const proveedor of llm.proveedores) {
    const nombre = proveedor.apiKeyEnv;
    if (vistas.has(nombre)) {
      continue;
    }
    vistas.add(nombre);
    const valor = env[nombre];
    if (valor === undefined || valor.trim() === "") {
      ausentes.push(nombre);
    }
  }

  return ausentes;
};
