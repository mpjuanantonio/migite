import {
  type CreateObjectBody,
  type ObjectPayload,
  type ObjetosPage,
  objectPayloadSchema,
  objetosPageSchema,
  type SesionStatus,
  sesionStatusSchema,
} from "@migite/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { queryKeys } from "./keys";

export type ObjetosParams = {
  readonly tipo?: string;
  readonly carpeta?: string;
  readonly limite?: number;
  readonly cursor?: string;
};

const objetosPath = (params?: ObjetosParams): string => {
  const query = new URLSearchParams();
  if (params?.tipo !== undefined && params.tipo !== "") {
    query.set("tipo", params.tipo);
  }
  if (params?.carpeta !== undefined && params.carpeta !== "") {
    query.set("carpeta", params.carpeta);
  }
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

export const useCerrarSesion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiFetch<void>("/api/sesion", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.clear();
    },
  });
};

export const useObjetos = (params?: ObjetosParams) =>
  useQuery({
    queryKey: [...queryKeys.objetos, params ?? {}],
    queryFn: async (): Promise<ObjetosPage> =>
      objetosPageSchema.parse(await apiFetch(objetosPath(params))),
  });

export type ObjetosListaParams = {
  readonly tipo?: string;
  readonly carpeta?: string;
  readonly limite?: number;
};

export const useObjetosInfinitos = (params?: ObjetosListaParams) =>
  useInfiniteQuery({
    queryKey: [...queryKeys.objetos, { infinito: true, ...(params ?? {}) }] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<ObjetosPage> =>
      objetosPageSchema.parse(await apiFetch(objetosPath({ ...params, cursor: pageParam }))),
    getNextPageParam: (ultimaPagina) => ultimaPagina.siguienteCursor ?? undefined,
  });

export const useCrearObjeto = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateObjectBody): Promise<ObjectPayload> =>
      objectPayloadSchema.parse(await apiFetch("/api/objetos", { method: "POST", body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.objetos });
    },
  });
};

const objetoPath = (id: string): string => `/api/objetos/${encodeURIComponent(id)}`;

export const useObjeto = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.objeto(id ?? ""),
    enabled: id !== undefined,
    queryFn: async (): Promise<ObjectPayload> =>
      objectPayloadSchema.parse(await apiFetch(objetoPath(id ?? ""))),
  });

export const useGuardarObjeto = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cuerpo: string): Promise<ObjectPayload> =>
      objectPayloadSchema.parse(
        await apiFetch(objetoPath(id), { method: "PATCH", body: { cuerpo } }),
      ),
    onSuccess: (objeto) => {
      queryClient.setQueryData(queryKeys.objeto(id), objeto);
    },
  });
};
