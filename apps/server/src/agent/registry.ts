import { ToolRegistry } from "@migite/llm";
import { type HerramientasLecturaDeps, registrarHerramientasDeLectura } from "./tools/read.js";

export type RegistroAgenteDeps = HerramientasLecturaDeps;

export const crearRegistroDelAgente = (deps: RegistroAgenteDeps): ToolRegistry => {
  const registry = new ToolRegistry();
  registrarHerramientasDeLectura(registry, deps);
  return registry;
};
