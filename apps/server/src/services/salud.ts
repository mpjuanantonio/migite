import type { IndexDatabase } from "@migite/index";
import { sql } from "drizzle-orm";
import { stripAbsolutePaths, type WatchStatus } from "../runtime.js";

export type SaludDeps = {
  readonly contarObjetos: () => number;
  readonly estadoWatcher: () => WatchStatus;
  readonly version?: string;
};

export type EstadoIndice = {
  readonly objetos: number;
  readonly listo: boolean;
  readonly ultimoError: string | null;
};

export type SaludPayload = {
  readonly status: "ok" | "degradado";
  readonly indice: EstadoIndice;
  readonly version?: string;
};

export const SIN_RUNTIME: SaludDeps = {
  contarObjetos: () => 0,
  estadoWatcher: () => ({ listo: false, ultimoError: null }),
};

export const contarObjetosIndexados = (db: IndexDatabase): number =>
  db.get<{ total: number }>(sql`SELECT COUNT(*) AS total FROM objetos`)?.total ?? 0;

export const evaluarSalud = (deps: SaludDeps): SaludPayload => {
  const watcher = deps.estadoWatcher();
  const ultimoError = watcher.ultimoError === null ? null : stripAbsolutePaths(watcher.ultimoError);
  const degradado = !watcher.listo || ultimoError !== null;
  return {
    status: degradado ? "degradado" : "ok",
    indice: {
      objetos: deps.contarObjetos(),
      listo: watcher.listo,
      ultimoError,
    },
    ...(deps.version === undefined ? {} : { version: deps.version }),
  };
};
