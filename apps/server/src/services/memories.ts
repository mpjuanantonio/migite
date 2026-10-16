import { type Memoria, memoriaSchema } from "@migite/contracts";
import {
  actualizarMemoria as actualizarMemoriaEnIndice,
  borrarMemoria as borrarMemoriaEnIndice,
  type IndexDatabase,
  listarMemorias as listarMemoriasEnIndice,
  type MemoriaRecord,
  obtenerMemoria,
} from "@migite/index";

export type MemoriasDeps = {
  readonly db: IndexDatabase;
};

export type MemoriaErrorCodigo = "memory_not_found";

export class MemoriaError extends Error {
  readonly codigo: MemoriaErrorCodigo;

  constructor(codigo: MemoriaErrorCodigo) {
    super(codigo);
    this.name = "MemoriaError";
    this.codigo = codigo;
  }
}

const toWire = (record: MemoriaRecord): Memoria => memoriaSchema.parse(record);

const exigirMemoria = (deps: MemoriasDeps, id: string): MemoriaRecord => {
  const memoria = obtenerMemoria(deps.db, id);
  if (memoria === undefined) {
    throw new MemoriaError("memory_not_found");
  }
  return memoria;
};

export const listarMemorias = (deps: MemoriasDeps): Memoria[] =>
  listarMemoriasEnIndice(deps.db).map(toWire);

export const actualizarMemoria = (deps: MemoriasDeps, id: string, contenido: string): Memoria => {
  exigirMemoria(deps, id);
  return toWire(actualizarMemoriaEnIndice(deps.db, id, { contenido }));
};

export const borrarMemoria = (deps: MemoriasDeps, id: string): void => {
  exigirMemoria(deps, id);
  borrarMemoriaEnIndice(deps.db, id);
};
