import {
  type CreateObjectBody,
  type ObjectPayload,
  type ObjetosPage,
  objectPayloadSchema,
  objetosPageSchema,
  type RenameReport,
  renameReportSchema,
  type SesionStatus,
  sesionStatusSchema,
  type TipoPayload,
  tiposListSchema,
} from "@migite/contracts";
import {
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "./api";
import { queryKeys } from "./keys";

export type RangoAtributo = {
  readonly clave: string;
  readonly desde?: string;
  readonly hasta?: string;
};

export type ObjetosParams = {
  readonly tipo?: string;
  readonly carpeta?: string;
  readonly limite?: number;
  readonly cursor?: string;
  readonly atributos?: Readonly<Record<string, string | readonly string[]>>;
  readonly rangoAtributo?: readonly RangoAtributo[];
};

const objetosPath = (params?: ObjetosParams): string => {
  const query = new URLSearchParams();
  if (params?.tipo !== undefined && params.tipo !== "") {
    query.set("tipo", params.tipo);
  }
  if (params?.carpeta !== undefined && params.carpeta !== "") {
    query.set("carpeta", params.carpeta);
  }
  if (params?.atributos !== undefined) {
    for (const [clave, valor] of Object.entries(params.atributos)) {
      for (const item of typeof valor === "string" ? [valor] : valor) {
        query.append(`atributo.${clave}`, item);
      }
    }
  }
  if (params?.rangoAtributo !== undefined) {
    for (const rango of params.rangoAtributo) {
      if (rango.desde !== undefined && rango.desde !== "") {
        query.set(`rango.${rango.clave}.desde`, rango.desde);
      }
      if (rango.hasta !== undefined && rango.hasta !== "") {
        query.set(`rango.${rango.clave}.hasta`, rango.hasta);
      }
    }
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

export const useConfigurarCredenciales = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credenciales: Credenciales) =>
      apiFetch<void>("/api/sesion/setup", { method: "POST", body: credenciales }),
    onSuccess: () => {
      queryClient.setQueryData<SesionStatus>(queryKeys.sesion, {
        autenticado: true,
        setupRequerido: false,
      });
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

export type ObjetosListaParams = Omit<ObjetosParams, "cursor">;

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

const invalidarListasDeObjetos = (queryClient: QueryClient): void => {
  void queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === queryKeys.objetos[0] && typeof query.queryKey[1] !== "string",
  });
};

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

const guardarAtributosDe = async (
  id: string,
  atributos: Record<string, unknown>,
): Promise<ObjectPayload> =>
  objectPayloadSchema.parse(
    await apiFetch(objetoPath(id), { method: "PATCH", body: { atributos } }),
  );

const aplicarAtributosGuardados = (queryClient: QueryClient, objeto: ObjectPayload): void => {
  queryClient.setQueryData(queryKeys.objeto(objeto.id), objeto);
  invalidarListasDeObjetos(queryClient);
};

export const useGuardarAtributos = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (atributos: Record<string, unknown>): Promise<ObjectPayload> =>
      guardarAtributosDe(id, atributos),
    onSuccess: (objeto) => {
      aplicarAtributosGuardados(queryClient, objeto);
    },
  });
};

export type MovimientoEventoBody = {
  readonly id: string;
  readonly inicio: string;
  readonly fin?: string;
};

export const useMoverEvento = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, inicio, fin }: MovimientoEventoBody): Promise<ObjectPayload> =>
      guardarAtributosDe(id, { inicio, ...(fin === undefined ? {} : { fin }) }),
    onSuccess: (objeto) => {
      aplicarAtributosGuardados(queryClient, objeto);
    },
  });
};

export const useRenombrarObjeto = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (nuevoTitulo: string): Promise<RenameReport> =>
      renameReportSchema.parse(
        await apiFetch(`${objetoPath(id)}/renombrar`, {
          method: "POST",
          body: { nuevoTitulo },
        }),
      ),
    onSuccess: (reporte) => {
      queryClient.setQueryData(queryKeys.objeto(id), reporte.objeto);
      invalidarListasDeObjetos(queryClient);
    },
  });
};

export const useBorrarObjeto = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`${objetoPath(id)}?confirmar=1`, { method: "DELETE" }),
    onSuccess: (_resultado, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.objeto(id) });
      invalidarListasDeObjetos(queryClient);
    },
  });
};

export const useTipos = () =>
  useQuery({
    queryKey: queryKeys.tipos,
    queryFn: async (): Promise<TipoPayload[]> =>
      tiposListSchema.parse(await apiFetch("/api/tipos")).tipos,
  });
