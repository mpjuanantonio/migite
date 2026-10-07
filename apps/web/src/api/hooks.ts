import {
  type ObjetosPage,
  objetosPageSchema,
  type SesionStatus,
  sesionStatusSchema,
} from "@migite/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export type Credenciales = {
  readonly usuario: string;
  readonly contrasena: string;
};

export const useIniciarSesion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credenciales: Credenciales) =>
      apiFetch<void>("/api/sesion", { method: "POST", body: credenciales }),
    onSuccess: () => {
      queryClient.setQueryData<SesionStatus>(queryKeys.sesion, { autenticado: true });
    },
  });
};

export const useObjetos = (params?: ObjetosParams) =>
  useQuery({
    queryKey: [...queryKeys.objetos, params ?? {}],
    queryFn: async (): Promise<ObjetosPage> =>
      objetosPageSchema.parse(await apiFetch(objetosPath(params))),
  });
