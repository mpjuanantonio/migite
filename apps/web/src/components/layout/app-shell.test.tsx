import type { ObjectPayload, TipoPayload } from "@migite/contracts";
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { jsonResponse, renderApp, sesionResponse } from "@/test/render-app";

let fetchMock: Mock<typeof fetch>;

const tipo = (
  id: string,
  nombre: string,
  presentacion?: TipoPayload["presentacion"],
): TipoPayload => ({
  id,
  nombre,
  atributos: [],
  ...(presentacion === undefined ? {} : { presentacion }),
});

const TIPOS: readonly TipoPayload[] = [
  tipo("nota", "Nota"),
  tipo("libro", "Libro", { seccion: "productividad", visible: true }),
  tipo("rutina", "Rutina", { seccion: "productividad", visible: false }),
  tipo("idea", "Idea", { seccion: "notas", visible: true }),
  tipo("receta", "Receta"),
];

const objetoLibro = (id: string, titulo: string): ObjectPayload => ({
  id,
  tipo: "libro",
  titulo,
  ruta: `libros/${id}.md`,
  carpeta: "libros",
  creado: "2026-10-01T10:00:00.000Z",
  actualizado: "2026-10-05T18:30:00.000Z",
  atributos: {},
  cuerpo: "",
  enlaces: [],
  degraded: [],
});

const mockApi = (): void => {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/tipos") {
      return jsonResponse({ tipos: TIPOS });
    }
    if (url.pathname === "/api/objetos/arbol") {
      return jsonResponse({ nodos: [] });
    }
    if (url.pathname === "/api/objetos") {
      return jsonResponse({
        objetos: [objetoLibro("A", "El Quijote")],
        siguienteCursor: null,
      });
    }
    return sesionResponse(true);
  });
};

const renderShell = (ruta: string) =>
  renderApp(ruta, new QueryClient({ defaultOptions: { queries: { retry: false } } }));

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const navPrincipal = async (): Promise<HTMLElement> =>
  screen.findByRole("navigation", { name: "Navegación principal" });

describe("barra lateral agrupada", () => {
  it("agrupa los tipos personalizados visibles en productividad y omite notas, ocultos y sin sección", async () => {
    mockApi();
    renderShell("/notas");

    const nav = await navPrincipal();
    expect(within(nav).getByRole("heading", { name: "Notas" })).toBeInTheDocument();
    expect(within(nav).getByRole("heading", { name: "Productividad" })).toBeInTheDocument();

    for (const label of [
      "Notas",
      "Tareas",
      "Recordatorios",
      "Calendario",
      "Proyectos",
      "Tipos",
      "Buscar",
    ]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }

    expect(await within(nav).findByRole("link", { name: "Libro" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Rutina" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Idea" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Receta" })).toBeNull();
  });

  it("navega al listado del tipo con la query tipo al pulsar su entrada", async () => {
    mockApi();
    const user = userEvent.setup();
    const { router } = renderShell("/notas");

    const nav = await navPrincipal();
    await user.click(await within(nav).findByRole("link", { name: "Libro" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/tipo/libro"));
    expect(await screen.findByRole("heading", { level: 1, name: "Libro" })).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) => {
          const url = new URL(String(input), "http://localhost");
          return url.pathname === "/api/objetos" && url.searchParams.get("tipo") === "libro";
        }),
      ).toBe(true),
    );
  });
});
