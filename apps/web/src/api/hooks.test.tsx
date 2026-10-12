import type { ObjectPayload } from "@migite/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { errorResponse, jsonResponse } from "@/test/render-app";
import { useBorrarObjeto, useObjeto, useRenombrarObjeto, useResolverObjeto } from "./hooks";
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
