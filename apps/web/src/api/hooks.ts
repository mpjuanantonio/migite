import {
  type ObjetosPage,
  objetosPageSchema,
  type SesionStatus,
  sesionStatusSchema,
} from "@migite/contracts";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { queryKeys } from "./keys";

export type ObjetosParams = {
  readonly limite?: number;
  readonly cursor?: string;
};

const objetosPath = (params?: ObjetosParams): string => {
  const query = new URLSearchParams();
  if (params?.limite !== undefined) {
    query.set("limite", String(params.limite));
  }
  if (params?.cursor !== undefined) {
    query.set("cursor", params.cursor);
  }
  const suffix = query.toString();
  return suffix === "" ? "/api/objetos" : `/api/objetos?${suffix}`;
};

export const useSesion = () =>
  useQuery({
    queryKey: queryKeys.sesion,
    queryFn: async (): Promise<SesionStatus> =>
      sesionStatusSchema.parse(await apiFetch("/api/sesion")),
  });

export const useObjetos = (params?: ObjetosParams) =>
  useQuery({
    queryKey: [...queryKeys.objetos, params ?? {}],
    queryFn: async (): Promise<ObjetosPage> =>
      objetosPageSchema.parse(await apiFetch(objetosPath(params))),
  });
