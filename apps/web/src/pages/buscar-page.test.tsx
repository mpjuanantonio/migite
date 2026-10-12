import type { SearchResultItem, TipoPayload } from "@migite/contracts";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { errorResponse, jsonResponse, renderApp, sesionResponse } from "@/test/render-app";

let fetchMock: Mock<typeof fetch>;
let busquedas: URL[];

const resultado = (
  id: string,
  tipo: string,
  titulo: string,
  fragmento?: string,
): SearchResultItem => ({
  id,
  tipo,
  titulo,
  ruta: `${tipo}/${id}.md`,
  actualizado: "2026-10-05T10:00:00.000Z",
  ...(fragmento === undefined ? {} : { fragmento }),
});

const tipo = (id: string, nombre: string): TipoPayload => ({ id, nombre, atributos: [] });

type OpcionesMock = {
  readonly tipos?: readonly TipoPayload[];
  readonly respuesta?: (url: URL) => Response;
};

const mockApi = (opciones: OpcionesMock = {}): void => {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input), "http://localhost");

    if (url.pathname === "/api/sesion") {
      return sesionResponse(true);
    }

    if (url.pathname === "/api/tipos") {
      return jsonResponse({ tipos: opciones.tipos ?? [] });
    }

    if (url.pathname === "/api/buscar") {
      busquedas.push(url);
      return opciones.respuesta?.(url) ?? jsonResponse({ resultados: [], siguienteCursor: null });
    }

    return errorResponse("not_found", "No existe la ruta", 404);
  });
};

const renderBuscar = () =>
  renderApp("/buscar", new QueryClient({ defaultOptions: { queries: { retry: false } } }));

const campoDeBusqueda = async (name = "Buscar en el archivo"): Promise<HTMLElement> =>
  screen.findByRole("searchbox", { name });

beforeEach(() => {
  localStorage.clear();
  busquedas = [];
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("búsqueda global", () => {
  it("muestra la pista inicial sin lanzar consultas", async () => {
    mockApi();
    renderBuscar();

    expect(await screen.findByText("Escribe una búsqueda para empezar.")).toBeInTheDocument();
    expect(busquedas).toHaveLength(0);
  });

  it("busca tras el debounce y agrupa los resultados por tipo con fragmento", async () => {
    mockApi({
      tipos: [tipo("nota", "Nota"), tipo("tarea", "Tarea"), tipo("libro", "Libro")],
      respuesta: () =>
        jsonResponse({
          resultados: [
            resultado("N1", "nota", "Primera nota", "Hablamos de la casa del pueblo"),
            resultado("T1", "tarea", "Tarea de casa"),
            resultado("L1", "libro", "Un libro"),
          ],
          siguienteCursor: null,
        }),
    });
    renderBuscar();
    const user = userEvent.setup();

    const campo = await campoDeBusqueda();
    await user.type(campo, "casa");

    expect(await screen.findByRole("heading", { level: 2, name: "Notas (1)" })).toBeInTheDocument();
    const encabezados = screen
      .getAllByRole("heading", { level: 2 })
      .map((item) => item.textContent);
    expect(encabezados).toEqual(["Notas (1)", "Tareas (1)", "Libro (1)"]);
    expect(busquedas.at(-1)?.searchParams.get("q")).toBe("casa");

    const marca = screen.getByText("casa");
    expect(marca.tagName).toBe("MARK");
    expect(screen.getByText("Hablamos de la")).toBeInTheDocument();
  });

  it("no consulta hasta que pasa el retraso del debounce", async () => {
    mockApi({
      respuesta: () =>
        jsonResponse({
          resultados: [resultado("N1", "nota", "Primera nota")],
          siguienteCursor: null,
        }),
    });
    renderBuscar();
    const user = userEvent.setup();

    const campo = await campoDeBusqueda();
    await user.type(campo, "casa");
    expect(busquedas).toHaveLength(0);

    await waitFor(() => expect(busquedas).toHaveLength(1));
    expect(busquedas[0]?.searchParams.get("q")).toBe("casa");
  });

  it("envía al pulsar Enter sin esperar al debounce", async () => {
    mockApi({
      respuesta: () =>
        jsonResponse({
          resultados: [resultado("N1", "nota", "Primera nota")],
          siguienteCursor: null,
        }),
    });
    renderBuscar();
    const user = userEvent.setup();

    const campo = await campoDeBusqueda();
    await user.type(campo, "casa{Enter}");

    await waitFor(() => expect(busquedas).toHaveLength(1), { timeout: 250 });
    expect(busquedas[0]?.searchParams.get("q")).toBe("casa");
  });

  it("serializa los filtros de tipo, tag y fechas en la consulta", async () => {
    vi.stubEnv("TZ", "America/Bogota");
    mockApi({
      tipos: [tipo("nota", "Nota"), tipo("tarea", "Tarea")],
      respuesta: () => jsonResponse({ resultados: [], siguienteCursor: null }),
    });
    renderBuscar();
    const user = userEvent.setup();

    const campo = await campoDeBusqueda();
    await user.type(campo, "proyecto");
    await user.selectOptions(screen.getByLabelText("Tipo"), "tarea");
    await user.type(screen.getByLabelText("Etiqueta"), "casa");
    fireEvent.change(screen.getByLabelText("Actualizado desde"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.change(screen.getByLabelText("Actualizado hasta"), {
      target: { value: "2026-10-05" },
    });

    await waitFor(() => expect(busquedas.at(-1)?.searchParams.get("tag")).toBe("casa"));
    const ultima = busquedas.at(-1);
    expect(ultima?.searchParams.get("q")).toBe("proyecto");
    expect(ultima?.searchParams.get("tipo")).toBe("tarea");
    expect(ultima?.searchParams.get("desde")).toBe("2026-10-01");
    expect(ultima?.searchParams.get("hasta")).toBe("2026-10-06T04:59:59.999Z");
    expect(ultima?.searchParams.get("limite")).toBe("20");
  });

  it("navega al objeto al pulsar su título", async () => {
    mockApi({
      respuesta: () =>
        jsonResponse({
          resultados: [resultado("N1", "nota", "Primera nota")],
          siguienteCursor: null,
        }),
    });
    const { router } = renderBuscar();
    const user = userEvent.setup();

    await user.type(await campoDeBusqueda(), "nota");
    await user.click(await screen.findByRole("link", { name: "Primera nota" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/objetos/N1"));
  });

  it("pagina con Cargar más sin duplicar resultados", async () => {
    mockApi({
      respuesta: (url) =>
        url.searchParams.get("cursor") === "cursor-1"
          ? jsonResponse({
              resultados: [resultado("N3", "nota", "Tercera nota")],
              siguienteCursor: null,
            })
          : jsonResponse({
              resultados: [
                resultado("N1", "nota", "Primera nota"),
                resultado("T1", "tarea", "Una tarea"),
              ],
              siguienteCursor: "cursor-1",
            }),
    });
    renderBuscar();
    const user = userEvent.setup();

    await user.type(await campoDeBusqueda(), "nota");
    await screen.findByRole("link", { name: "Primera nota" });
    await user.click(screen.getByRole("button", { name: "Cargar más" }));

    expect(await screen.findByRole("link", { name: "Tercera nota" })).toBeInTheDocument();
    expect(busquedas.at(-1)?.searchParams.get("cursor")).toBe("cursor-1");
    expect(screen.getByRole("heading", { level: 2, name: "Notas (2)" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Primera nota" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();
  });

  it("muestra el estado sin resultados", async () => {
    mockApi();
    renderBuscar();
    const user = userEvent.setup();

    await user.type(await campoDeBusqueda(), "zzz");

    expect(await screen.findByText("No hay resultados para tu búsqueda.")).toBeInTheDocument();
  });

  it("muestra el error y permite reintentar", async () => {
    let intentos = 0;
    mockApi({
      respuesta: () => {
        intentos += 1;
        return intentos === 1
          ? errorResponse("boom", "La búsqueda falló", 500)
          : jsonResponse({
              resultados: [resultado("N1", "nota", "Primera nota")],
              siguienteCursor: null,
            });
      },
    });
    renderBuscar();
    const user = userEvent.setup();

    await user.type(await campoDeBusqueda(), "nota");

    expect(
      await screen.findByRole("heading", { name: "No se pudo completar la búsqueda" }),
    ).toBeInTheDocument();
    expect(screen.getByText("La búsqueda falló")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("link", { name: "Primera nota" })).toBeInTheDocument();
  });

  it("limpia la búsqueda y los filtros", async () => {
    mockApi({
      tipos: [tipo("nota", "Nota"), tipo("tarea", "Tarea")],
      respuesta: () => jsonResponse({ resultados: [], siguienteCursor: null }),
    });
    renderBuscar();
    const user = userEvent.setup();

    await user.type(await campoDeBusqueda(), "nota");
    await user.selectOptions(screen.getByLabelText("Tipo"), "tarea");
    await waitFor(() => expect(busquedas.length).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: "Limpiar" }));

    expect(screen.getByText("Escribe una búsqueda para empezar.")).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByLabelText("Tipo")).toHaveValue("");
  });

  it("traduce la página al inglés", async () => {
    mockApi();
    renderBuscar();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Inglés" }));

    expect(
      await screen.findByRole("searchbox", { name: "Search the archive" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Type a search to get started.")).toBeInTheDocument();
  });
});
