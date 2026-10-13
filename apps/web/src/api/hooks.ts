import {
  type ArbolObjetos,
  type ArbolObjetosParams,
  type AttributePayload,
  arbolObjetosSchema,
  type CreateObjectBody,
  type EnlacesEntrantes,
  enlacesEntrantesSchema,
  type ObjectPayload,
  type ObjetosPage,
  objectPayloadSchema,
  objetosPageSchema,
  type PresentacionPayload,
  type RenameReport,
  renameReportSchema,
  type SearchResults,
  type SesionStatus,
  searchResultsSchema,
  sesionStatusSchema,
  type TipoPayload,
  tipoPayloadSchema,
  tiposListSchema,
} from "@migite/contracts";
import {
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiError, apiFetch } from "./api";
import { esColeccionDeObjetos, queryKeys } from "./keys";

export type RangoAtributo = {
  readonly clave: string;
  readonly desde?: string;
  readonly hasta?: string;
};

export type ObjetosParams = {
  readonly tipo?: string;
  readonly carpeta?: string;
  readonly tag?: string;
  readonly enlazadoA?: string;
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
  if (params?.tag !== undefined && params.tag !== "") {
    query.set("tag", params.tag);
  }
  if (params?.enlazadoA !== undefined && params.enlazadoA !== "") {
    query.set("enlazadoA", params.enlazadoA);
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

export type BuscarParams = {
  readonly q?: string;
  readonly tipo?: string;
  readonly tag?: string;
  readonly desde?: string;
  readonly hasta?: string;
  readonly limite?: number;
};

const buscarPath = (params: BuscarParams & { readonly cursor?: string }): string => {
  const query = new URLSearchParams();
  if (params.q !== undefined && params.q !== "") {
    query.set("q", params.q);
  }
  if (params.tipo !== undefined && params.tipo !== "") {
    query.set("tipo", params.tipo);
  }
  if (params.tag !== undefined && params.tag !== "") {
    query.set("tag", params.tag);
  }
  if (params.desde !== undefined && params.desde !== "") {
    query.set("desde", params.desde);
  }
  if (params.hasta !== undefined && params.hasta !== "") {
    query.set("hasta", params.hasta);
  }
  if (params.limite !== undefined) {
    query.set("limite", String(params.limite));
  }
  if (params.cursor !== undefined) {
    query.set("cursor", params.cursor);
  }
  const suffix = query.toString();
  return suffix === "" ? "/api/buscar" : `/api/buscar?${suffix}`;
};

export const useBuscarInfinitos = (params: BuscarParams, activa: boolean) =>
  useInfiniteQuery({
    queryKey: [...queryKeys.buscar, params] as const,
    enabled: activa,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<SearchResults> =>
      searchResultsSchema.parse(await apiFetch(buscarPath({ ...params, cursor: pageParam }))),
    getNextPageParam: (ultimaPagina) => ultimaPagina.siguienteCursor ?? undefined,
  });

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

const ARBOL_STALE_TIME = 5 * 60 * 1000;

const arbolPath = (params?: ArbolObjetosParams): string => {
  const query = new URLSearchParams();
  if (params?.tipo !== undefined && params.tipo !== "") {
    query.set("tipo", params.tipo);
  }
  if (params?.limite !== undefined) {
    query.set("limite", String(params.limite));
  }
  const suffix = query.toString();
  return suffix === "" ? "/api/objetos/arbol" : `/api/objetos/arbol?${suffix}`;
};

export const useArbolObjetos = (params?: ArbolObjetosParams) =>
  useQuery({
    queryKey: [...queryKeys.arbol, params ?? {}],
    staleTime: ARBOL_STALE_TIME,
    queryFn: async (): Promise<ArbolObjetos> =>
      arbolObjetosSchema.parse(await apiFetch(arbolPath(params))),
  });

export const useCrearObjeto = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateObjectBody): Promise<ObjectPayload> =>
      objectPayloadSchema.parse(await apiFetch("/api/objetos", { method: "POST", body })),
    onSuccess: () => {
      invalidarColeccionesDeObjetos(queryClient);
    },
  });
};

const objetoPath = (id: string): string => `/api/objetos/${encodeURIComponent(id)}`;

export type OpcionesInvalidacionColecciones = {
  readonly refetchType?: "all" | "active" | "inactive" | "none";
};

export const invalidarColeccionesDeObjetos = (
  queryClient: QueryClient,
  opciones?: OpcionesInvalidacionColecciones,
): void => {
  void queryClient.invalidateQueries({
    predicate: (query) => esColeccionDeObjetos(query.queryKey),
    ...(opciones ?? {}),
  });
};

const invalidarResolucionesDeTitulo = (queryClient: QueryClient): void => {
  void queryClient.invalidateQueries({ queryKey: [...queryKeys.objetos, "resolver"] });
};

export const useObjeto = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.objeto(id ?? ""),
    enabled: id !== undefined,
    queryFn: async (): Promise<ObjectPayload> =>
      objectPayloadSchema.parse(await apiFetch(objetoPath(id ?? ""))),
  });

export const useEnlacesEntrantes = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.enlacesEntrantes(id ?? ""),
    enabled: id !== undefined,
    queryFn: async (): Promise<EnlacesEntrantes> =>
      enlacesEntrantesSchema.parse(await apiFetch(`${objetoPath(id ?? "")}/enlaces-entrantes`)),
  });

export const useResolverObjeto = (titulo: string) =>
  useQuery({
    queryKey: queryKeys.resolver(titulo),
    enabled: titulo !== "",
    retry: false,
    queryFn: async (): Promise<ObjectPayload | null> => {
      try {
        return objectPayloadSchema.parse(await apiFetch(objetoPath(titulo)));
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
  });

const COLAS_DE_GUARDADO = new Map<string, Promise<unknown>>();

const limpiarColaDeGuardado = (id: string, cola: Promise<unknown>): void => {
  if (COLAS_DE_GUARDADO.get(id) === cola) {
    COLAS_DE_GUARDADO.delete(id);
  }
};

const enColaDeGuardado = <T>(id: string, tarea: () => Promise<T>): Promise<T> => {
  const anterior = COLAS_DE_GUARDADO.get(id) ?? Promise.resolve();
  const actual = anterior.then(tarea, tarea);
  const cola = actual.then(
    () => undefined,
    () => undefined,
  );
  COLAS_DE_GUARDADO.set(id, cola);
  void cola.then(() => limpiarColaDeGuardado(id, cola));
  return actual;
};

export const useGuardarObjeto = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cuerpo: string): Promise<ObjectPayload> =>
      enColaDeGuardado(id, async () =>
        objectPayloadSchema.parse(
          await apiFetch(objetoPath(id), { method: "PATCH", body: { cuerpo } }),
        ),
      ),
    onSuccess: (objeto) => {
      queryClient.setQueryData(queryKeys.objeto(id), objeto);
      invalidarColeccionesDeObjetos(queryClient);
    },
  });
};

const guardarAtributosDe = (
  id: string,
  atributos: Record<string, unknown>,
): Promise<ObjectPayload> =>
  enColaDeGuardado(id, async () =>
    objectPayloadSchema.parse(
      await apiFetch(objetoPath(id), { method: "PATCH", body: { atributos } }),
    ),
  );

const aplicarAtributosGuardados = (queryClient: QueryClient, objeto: ObjectPayload): void => {
  queryClient.setQueryData(queryKeys.objeto(objeto.id), objeto);
  invalidarColeccionesDeObjetos(queryClient);
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.enlacesEntrantes(id) });
      invalidarColeccionesDeObjetos(queryClient);
      invalidarResolucionesDeTitulo(queryClient);
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
      queryClient.removeQueries({ queryKey: queryKeys.enlacesEntrantes(id) });
      invalidarColeccionesDeObjetos(queryClient);
      invalidarResolucionesDeTitulo(queryClient);
    },
  });
};

export const useTipos = () =>
  useQuery({
    queryKey: queryKeys.tipos,
    queryFn: async (): Promise<TipoPayload[]> =>
      tiposListSchema.parse(await apiFetch("/api/tipos")).tipos,
  });

export type TipoCambios = {
  readonly nombre?: string;
  readonly descripcion?: string;
  readonly atributos?: readonly AttributePayload[];
  readonly presentacion?: PresentacionPayload;
};

const TIPOS_PATH = "/api/tipos";

const tipoPath = (id: string): string => `${TIPOS_PATH}/${encodeURIComponent(id)}`;

const reemplazarTipo = (previos: TipoPayload[] | undefined, tipo: TipoPayload): TipoPayload[] =>
  previos === undefined
    ? [tipo]
    : previos.some((item) => item.id === tipo.id)
      ? previos.map((item) => (item.id === tipo.id ? tipo : item))
      : [...previos, tipo];

export const useCrearTipo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: TipoPayload): Promise<TipoPayload> =>
      tipoPayloadSchema.parse(await apiFetch(TIPOS_PATH, { method: "POST", body })),
    onSuccess: (tipo) => {
      queryClient.setQueryData<TipoPayload[]>(queryKeys.tipos, (previos) =>
        reemplazarTipo(previos, tipo),
      );
    },
  });
};

export const useActualizarTipo = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cambios: TipoCambios): Promise<TipoPayload> =>
      tipoPayloadSchema.parse(await apiFetch(tipoPath(id), { method: "PATCH", body: cambios })),
    onSuccess: (tipo) => {
      queryClient.setQueryData<TipoPayload[]>(queryKeys.tipos, (previos) =>
        reemplazarTipo(previos, tipo),
      );
    },
  });
};

export const useBorrarTipo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string): Promise<void> =>
      apiFetch<void>(`${tipoPath(id)}?confirmar=1`, { method: "DELETE" }),
    onSuccess: (_resultado, id) => {
      queryClient.setQueryData<TipoPayload[]>(queryKeys.tipos, (previos) =>
        (previos ?? []).filter((item) => item.id !== id),
      );
    },
  });
};
