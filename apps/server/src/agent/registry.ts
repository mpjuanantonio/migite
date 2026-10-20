import { ToolRegistry } from "@migite/llm";
import { type HerramientasLecturaDeps, registrarHerramientasDeLectura } from "./tools/read.js";
import { type HerramientasEscrituraDeps, registrarHerramientasDeEscritura } from "./tools/write.js";

export type RegistroAgenteDeps = HerramientasLecturaDeps & HerramientasEscrituraDeps;

export const crearRegistroDelAgente = (deps: RegistroAgenteDeps): ToolRegistry => {
  const registry = new ToolRegistry();
  registrarHerramientasDeLectura(registry, deps);
  registrarHerramientasDeEscritura(registry, deps);
  return registry;
};
