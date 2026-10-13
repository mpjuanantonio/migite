import type { ObjectPayload } from "@migite/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { errorResponse, jsonResponse } from "@/test/render-app";
import {
  invalidarColeccionesDeObjetos,
  useActualizarTipo,
  useArbolObjetos,
  useBorrarObjeto,
  useBorrarTipo,
  useCrearObjeto,
  useGuardarAtributos,
  useGuardarObjeto,
  useObjeto,
  useRenombrarObjeto,
  useResolverObjeto,
} from "./hooks";
import { queryKeys } from "./keys";

const objetoDePrueba: ObjectPayload = {
  id: "01JALFA",
  tipo: "nota",
  titulo: "Cuaderno de campo",
  ruta: "notas/cuaderno.md",
  carpeta: "notas",
  creado: "2026-10-01T10:00:00.000Z",
  actualizado: "2026-10-05T18:30:00.000Z",
  atributos: {},
  cuerpo: "",
  enlaces: [],
  degraded: [],
};

let fetchMock: Mock<typeof fetch>;
let cliente: QueryClient;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const envolver = ({ children }: { readonly children: ReactNode }) => (
  <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
);

const clavesDePrueba = () =>
  ({
    listado: [...queryKeys.objetos, { tipo: "nota", limite: 20 }],
    infinito: [...queryKeys.objetos, { infinito: true, tipo: "tarea" }],
    arbol: [...queryKeys.arbol, { tipo: "nota" }],
    buscar: [...queryKeys.buscar, { q: "cuaderno" }],
    detalle: queryKeys.objeto("01JALFA"),
    resolver: queryKeys.resolver("Cuaderno de campo"),
    enlaces: queryKeys.enlacesEntrantes("01JALFA"),
  }) as const;

const sembrarClaves = (): ReturnType<typeof clavesDePrueba> => {
  const claves = clavesDePrueba();
  for (const clave of Object.values(claves)) {
    cliente.setQueryData(clave, {});
  }
  return claves;
};

const estaInvalidada = (clave: readonly unknown[]): boolean =>
  cliente.getQueryState(clave)?.isInvalidated === true;

describe("useResolverObjeto", () => {
  it("guarda el 404 bajo su propia key sin contaminar la de useObjeto", async () => {
    let llamadas = 0;
    fetchMock.mockImplementation(async (input) => {
      if (String(input) === "/api/objetos/01JALFA") {
        llamadas += 1;
        return llamadas === 1
          ? errorResponse("object_not_found", "No existe «01JALFA»", 404)
          : jsonResponse(objetoDePrueba);
      }
      return errorResponse("not_found", "Ruta desconocida", 404);
    });

    const resolucion = renderHook(() => useResolverObjeto("01JALFA"), { wrapper: envolver });
    await waitFor(() => {
      expect(resolucion.result.current.isSuccess).toBe(true);
    });
    expect(resolucion.result.current.data).toBeNull();
    expect(cliente.getQueryData(queryKeys.resolver("01JALFA"))).toBeNull();
    expect(cliente.getQueryData(queryKeys.objeto("01JALFA"))).toBeUndefined();

    const ficha = renderHook(() => useObjeto("01JALFA"), { wrapper: envolver });
    await waitFor(() => {
      expect(ficha.result.current.data?.id).toBe("01JALFA");
    });
    expect(llamadas).toBe(2);
    expect(cliente.getQueryData(queryKeys.resolver("01JALFA"))).toBeNull();
  });
});

describe("useArbolObjetos", () => {
  const arbol = {
    nodos: [
      {
        id: "01JALFA",
        tipo: "nota",
        titulo: "Cuaderno de campo",
        ruta: "notas/cuaderno.md",
        carpeta: "notas",
        actualizado: "2026-10-05T18:30:00.000Z",
      },
    ],
  };

  it("pide el árbol ligero con los filtros indicados", async () => {
    fetchMock.mockResolvedValue(jsonResponse(arbol));

    const resultado = renderHook(() => useArbolObjetos({ tipo: "nota", limite: 25 }), {
      wrapper: envolver,
    });

    await waitFor(() => {
      expect(resultado.result.current.isSuccess).toBe(true);
    });
    expect(resultado.result.current.data).toEqual(arbol);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/objetos/arbol?tipo=nota&limite=25");
  });

  it("pide el árbol completo cuando no hay filtros", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ nodos: [] }));

    const resultado = renderHook(() => useArbolObjetos(), { wrapper: envolver });

    await waitFor(() => {
      expect(resultado.result.current.isSuccess).toBe(true);
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/objetos/arbol");
  });
});

describe("invalidarColeccionesDeObjetos", () => {
  it("invalida listados, árbol y búsqueda sin tocar detalle, resolver ni enlaces entrantes", () => {
    const claves = sembrarClaves();

    invalidarColeccionesDeObjetos(cliente);

    expect(estaInvalidada(claves.listado)).toBe(true);
    expect(estaInvalidada(claves.infinito)).toBe(true);
    expect(estaInvalidada(claves.arbol)).toBe(true);
    expect(estaInvalidada(claves.buscar)).toBe(true);
    expect(estaInvalidada(claves.detalle)).toBe(false);
    expect(estaInvalidada(claves.resolver)).toBe(false);
    expect(estaInvalidada(claves.enlaces)).toBe(false);
  });

  it("propaga las opciones de invalidación", () => {
    const invalidar = vi.spyOn(cliente, "invalidateQueries");

    invalidarColeccionesDeObjetos(cliente, { refetchType: "none" });

    expect(invalidar).toHaveBeenCalledWith({
      predicate: expect.any(Function),
      refetchType: "none",
    });
  });
});

describe("invalidación de colecciones en las mutaciones", () => {
  it("al crear invalida listados, árbol y búsqueda sin tocar el detalle ni el resolver", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) === "/api/objetos" && init?.method === "POST") {
        return jsonResponse(objetoDePrueba, 201);
      }
      return errorResponse("not_found", "Ruta desconocida", 404);
    });
    const claves = sembrarClaves();

    const crear = renderHook(() => useCrearObjeto(), { wrapper: envolver });
    await act(async () => {
      await crear.result.current.mutateAsync({ titulo: "Cuaderno de campo" });
    });

    expect(estaInvalidada(claves.listado)).toBe(true);
    expect(estaInvalidada(claves.infinito)).toBe(true);
    expect(estaInvalidada(claves.arbol)).toBe(true);
    expect(estaInvalidada(claves.buscar)).toBe(true);
    expect(estaInvalidada(claves.detalle)).toBe(false);
    expect(estaInvalidada(claves.resolver)).toBe(false);
  });

  it("al guardar atributos invalida listados, árbol y búsqueda sin tocar el detalle ni el resolver", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) === "/api/objetos/01JALFA" && init?.method === "PATCH") {
        return jsonResponse({ ...objetoDePrueba, atributos: { estado: "hecha" } });
      }
      return errorResponse("not_found", "Ruta desconocida", 404);
    });
    const claves = sembrarClaves();

    const guardar = renderHook(() => useGuardarAtributos("01JALFA"), { wrapper: envolver });
    await act(async () => {
      await guardar.result.current.mutateAsync({ estado: "hecha" });
    });

    expect(estaInvalidada(claves.listado)).toBe(true);
    expect(estaInvalidada(claves.infinito)).toBe(true);
    expect(estaInvalidada(claves.arbol)).toBe(true);
    expect(estaInvalidada(claves.buscar)).toBe(true);
    expect(estaInvalidada(claves.detalle)).toBe(false);
    expect(estaInvalidada(claves.resolver)).toBe(false);
  });

  it("al guardar el cuerpo invalida listados, árbol y búsqueda sin tocar el detalle", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) === "/api/objetos/01JALFA" && init?.method === "PATCH") {
        return jsonResponse({ ...objetoDePrueba, cuerpo: "Hola" });
      }
      return errorResponse("not_found", "Ruta desconocida", 404);
    });
    const claves = sembrarClaves();

    const guardar = renderHook(() => useGuardarObjeto("01JALFA"), { wrapper: envolver });
    await act(async () => {
      await guardar.result.current.mutateAsync("Hola");
    });

    expect(estaInvalidada(claves.listado)).toBe(true);
    expect(estaInvalidada(claves.infinito)).toBe(true);
    expect(estaInvalidada(claves.arbol)).toBe(true);
    expect(estaInvalidada(claves.buscar)).toBe(true);
    expect(estaInvalidada(claves.detalle)).toBe(false);
    expect(estaInvalidada(claves.resolver)).toBe(false);
  });

  it("al renombrar invalida listados, árbol, búsqueda y el resolver del título nuevo", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (String(input) === "/api/objetos/01JALFA/renombrar") {
        return jsonResponse({
          objeto: { ...objetoDePrueba, titulo: "Cuaderno nuevo" },
          informe: { reescritos: [], omitidos: [], enlacesSinResolver: [] },
        });
      }
      return errorResponse("not_found", "Ruta desconocida", 404);
    });
    const claves = sembrarClaves();

    const renombrar = renderHook(() => useRenombrarObjeto("01JALFA"), { wrapper: envolver });
    await act(async () => {
      await renombrar.result.current.mutateAsync("Cuaderno nuevo");
    });

    expect(estaInvalidada(claves.listado)).toBe(true);
    expect(estaInvalidada(claves.arbol)).toBe(true);
    expect(estaInvalidada(claves.buscar)).toBe(true);
    expect(estaInvalidada(claves.resolver)).toBe(true);
    expect(estaInvalidada(claves.detalle)).toBe(false);
  });

  it("al borrar invalida listados, árbol y búsqueda, y retira el detalle afectado", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const claves = sembrarClaves();

    const borrar = renderHook(() => useBorrarObjeto(), { wrapper: envolver });
    await act(async () => {
      await borrar.result.current.mutateAsync("01JALFA");
    });

    expect(estaInvalidada(claves.listado)).toBe(true);
    expect(estaInvalidada(claves.arbol)).toBe(true);
    expect(estaInvalidada(claves.buscar)).toBe(true);
    expect(cliente.getQueryData(claves.detalle)).toBeUndefined();
    expect(cliente.getQueryData(claves.enlaces)).toBeUndefined();
  });
});

describe("invalidación de colecciones al tocar tipos", () => {
  const tipoDePrueba = { id: "nota", nombre: "Nota", atributos: [] };

  it("al actualizar un tipo invalida listados, árbol y búsqueda", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) === "/api/tipos/nota" && init?.method === "PATCH") {
        return jsonResponse(tipoDePrueba);
      }
      return errorResponse("not_found", "Ruta desconocida", 404);
    });
    const claves = sembrarClaves();

    const actualizar = renderHook(() => useActualizarTipo("nota"), { wrapper: envolver });
    await act(async () => {
      await actualizar.result.current.mutateAsync({ nombre: "Nota" });
    });

    expect(estaInvalidada(claves.listado)).toBe(true);
    expect(estaInvalidada(claves.arbol)).toBe(true);
    expect(estaInvalidada(claves.buscar)).toBe(true);
    expect(estaInvalidada(claves.detalle)).toBe(false);
    expect(estaInvalidada(claves.resolver)).toBe(false);
  });

  it("al borrar un tipo invalida listados, árbol y búsqueda", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const claves = sembrarClaves();

    const borrar = renderHook(() => useBorrarTipo(), { wrapper: envolver });
    await act(async () => {
      await borrar.result.current.mutateAsync("nota");
    });

    expect(estaInvalidada(claves.listado)).toBe(true);
    expect(estaInvalidada(claves.arbol)).toBe(true);
    expect(estaInvalidada(claves.buscar)).toBe(true);
    expect(estaInvalidada(claves.detalle)).toBe(false);
    expect(estaInvalidada(claves.resolver)).toBe(false);
  });
});

describe("invalidación de enlaces entrantes", () => {
  it("invalida los enlaces entrantes al renombrar un objeto", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (String(input) === "/api/objetos/01JALFA/renombrar") {
        return jsonResponse({
          objeto: { ...objetoDePrueba, titulo: "Cuaderno nuevo" },
          informe: { reescritos: [], omitidos: [], enlacesSinResolver: [] },
        });
      }
      return errorResponse("not_found", "Ruta desconocida", 404);
    });
    const invalidar = vi.spyOn(cliente, "invalidateQueries");

    const renombrar = renderHook(() => useRenombrarObjeto("01JALFA"), { wrapper: envolver });
    await act(async () => {
      await renombrar.result.current.mutateAsync("Cuaderno nuevo");
    });

    expect(invalidar).toHaveBeenCalledWith({ queryKey: queryKeys.enlacesEntrantes("01JALFA") });
  });

  it("elimina los enlaces entrantes al borrar un objeto", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const eliminar = vi.spyOn(cliente, "removeQueries");

    const borrar = renderHook(() => useBorrarObjeto(), { wrapper: envolver });
    await act(async () => {
      await borrar.result.current.mutateAsync("01JALFA");
    });

    expect(eliminar).toHaveBeenCalledWith({ queryKey: queryKeys.enlacesEntrantes("01JALFA") });
    expect(cliente.getQueryData(queryKeys.enlacesEntrantes("01JALFA"))).toBeUndefined();
  });
});

describe("invalidación de la resolución por título", () => {
  it("refetchea la resolución del título nuevo al renombrar", async () => {
    const renombrado = { ...objetoDePrueba, titulo: "Cuaderno nuevo" };
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/objetos/01JALFA/renombrar") {
        return jsonResponse({
          objeto: renombrado,
          informe: { reescritos: [], omitidos: [], enlacesSinResolver: [] },
        });
      }
      if (url === "/api/objetos/Cuaderno%20nuevo") {
        return jsonResponse(renombrado);
      }
      return errorResponse("not_found", "Ruta desconocida", 404);
    });

    cliente.setQueryData(queryKeys.resolver("Cuaderno nuevo"), null);

    const resolucion = renderHook(() => useResolverObjeto("Cuaderno nuevo"), {
      wrapper: envolver,
    });
    await waitFor(() => {
      expect(resolucion.result.current.isSuccess).toBe(true);
    });
    expect(resolucion.result.current.data).toBeNull();

    const renombrar = renderHook(() => useRenombrarObjeto("01JALFA"), { wrapper: envolver });
    await act(async () => {
      await renombrar.result.current.mutateAsync("Cuaderno nuevo");
    });

    await waitFor(() => {
      expect(resolucion.result.current.data?.titulo).toBe("Cuaderno nuevo");
    });
  });

  it("refetchea la resolución del título al borrar", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/objetos/01JALFA?confirmar=1") {
        return new Response(null, { status: 204 });
      }
      if (url === "/api/objetos/Cuaderno%20de%20campo") {
        return errorResponse("object_not_found", "No existe «Cuaderno de campo»", 404);
      }
      return errorResponse("not_found", "Ruta desconocida", 404);
    });

    cliente.setQueryData(queryKeys.resolver("Cuaderno de campo"), objetoDePrueba);

    const resolucion = renderHook(() => useResolverObjeto("Cuaderno de campo"), {
      wrapper: envolver,
    });
    await waitFor(() => {
      expect(resolucion.result.current.data?.id).toBe("01JALFA");
    });

    const borrar = renderHook(() => useBorrarObjeto(), { wrapper: envolver });
    await act(async () => {
      await borrar.result.current.mutateAsync("01JALFA");
    });

    await waitFor(() => {
      expect(resolucion.result.current.data).toBeNull();
    });
  });
});

describe("guardados concurrentes del mismo objeto", () => {
  it("serializa los PATCH y conserva en caché ambos campos actualizados", async () => {
    const cuerpoNuevo = "Cuerpo nuevo";
    const atributosNuevos = { estado: "archivado" };
    let liberarCuerpo: (() => void) | undefined;
    const cuerpoEnVuelo = new Promise<void>((resolve) => {
      liberarCuerpo = resolve;
    });

    fetchMock.mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        readonly cuerpo?: string;
        readonly atributos?: Readonly<Record<string, unknown>>;
      };
      if (body.cuerpo !== undefined) {
        await cuerpoEnVuelo;
        return jsonResponse({ ...objetoDePrueba, cuerpo: body.cuerpo });
      }
      return jsonResponse({
        ...objetoDePrueba,
        cuerpo: cuerpoNuevo,
        atributos: { ...(body.atributos ?? {}) },
      });
    });

    const guardadoCuerpo = renderHook(() => useGuardarObjeto("01JALFA"), { wrapper: envolver });
    const guardadoAtributos = renderHook(() => useGuardarAtributos("01JALFA"), {
      wrapper: envolver,
    });

    const pendientes: Promise<ObjectPayload>[] = [];
    act(() => {
      pendientes.push(guardadoCuerpo.result.current.mutateAsync(cuerpoNuevo));
      pendientes.push(guardadoAtributos.result.current.mutateAsync(atributosNuevos));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ cuerpo: cuerpoNuevo });

    await act(async () => {
      liberarCuerpo?.();
      await Promise.all(pendientes);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      atributos: atributosNuevos,
    });

    const guardado = cliente.getQueryData<ObjectPayload>(queryKeys.objeto("01JALFA"));
    expect(guardado?.cuerpo).toBe(cuerpoNuevo);
    expect(guardado?.atributos).toEqual(atributosNuevos);
  });

  it("serializa el renombrado detrás de un PATCH de cuerpo en vuelo", async () => {
    let liberarCuerpo: (() => void) | undefined;
    const cuerpoEnVuelo = new Promise<void>((resolve) => {
      liberarCuerpo = resolve;
    });

    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) === "/api/objetos/01JALFA" && init?.method === "PATCH") {
        await cuerpoEnVuelo;
        return jsonResponse({ ...objetoDePrueba, cuerpo: "Cuerpo nuevo" });
      }
      if (String(input) === "/api/objetos/01JALFA/renombrar") {
        return jsonResponse({
          objeto: { ...objetoDePrueba, titulo: "Título nuevo" },
          informe: { reescritos: [], omitidos: [], enlacesSinResolver: [] },
        });
      }
      return errorResponse("not_found", "Ruta desconocida", 404);
    });

    const guardadoCuerpo = renderHook(() => useGuardarObjeto("01JALFA"), { wrapper: envolver });
    const renombrado = renderHook(() => useRenombrarObjeto("01JALFA"), { wrapper: envolver });

    const pendientes: Promise<unknown>[] = [];
    act(() => {
      pendientes.push(guardadoCuerpo.result.current.mutateAsync("Cuerpo nuevo"));
      pendientes.push(renombrado.result.current.mutateAsync("Título nuevo"));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/objetos/01JALFA");

    await act(async () => {
      liberarCuerpo?.();
      await Promise.all(pendientes);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("/api/objetos/01JALFA/renombrar");
    expect(cliente.getQueryData<ObjectPayload>(queryKeys.objeto("01JALFA"))?.titulo).toBe(
      "Título nuevo",
    );
  });
});
