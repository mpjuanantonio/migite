import type { ObjectPayload } from "@migite/contracts";
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { errorResponse, jsonResponse, renderApp, sesionResponse } from "@/test/render-app";

let fetchMock: Mock<typeof fetch>;
let listados: URL[];
let parches: {
  readonly id: string;
  readonly body: { readonly atributos?: Record<string, unknown> };
}[];

type OpcionesObjeto = {
  readonly estado?: string;
  readonly cuerpo?: string;
};

const objeto = (
  tipo: string,
  id: string,
  titulo: string,
  opciones: OpcionesObjeto = {},
): ObjectPayload => {
  const { estado, cuerpo = "" } = opciones;
  return {
    id,
    tipo,
    titulo,
    ruta: `${tipo}s/${id}.md`,
    carpeta: `${tipo}s`,
    creado: "2026-10-01T10:00:00.000Z",
    actualizado: "2026-10-04T10:00:00.000Z",
    atributos: estado === undefined ? {} : { estado },
    cuerpo,
    enlaces: [],
    degraded: [],
  };
};

type MockApiOptions = {
  readonly proyecto?: ObjectPayload;
  readonly asociados?: Partial<Record<string, readonly ObjectPayload[]>>;
};

const mockApi = (options: MockApiOptions = {}): void => {
  let principal =
    options.proyecto ??
    objeto("proyecto", "P1", "Mi proyecto", {
      estado: "activo",
      cuerpo: "## Objetivo\n\nTerminar la app",
    });
  const asociados = options.asociados ?? {};

  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";

    if (url.pathname === "/api/sesion") {
      return sesionResponse(true);
    }

    if (url.pathname === `/api/objetos/${principal.id}` && method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        atributos?: Record<string, unknown>;
      };
      parches.push({ id: principal.id, body });
      principal = {
        ...principal,
        atributos: { ...principal.atributos, ...(body.atributos ?? {}) },
        actualizado: new Date().toISOString(),
      };
      return jsonResponse(principal);
    }

    if (url.pathname === "/api/objetos") {
      listados.push(url);
      const tipo = url.searchParams.get("tipo") ?? "";
      return jsonResponse({ objetos: asociados[tipo] ?? [], siguienteCursor: null });
    }

    if (url.pathname.startsWith("/api/objetos/") && method === "GET") {
      const id = decodeURIComponent(url.pathname.slice("/api/objetos/".length));
      const todos: ObjectPayload[] = [principal];
      for (const lista of Object.values(asociados)) {
        if (lista !== undefined) {
          todos.push(...lista);
        }
      }
      const encontrado = todos.find((item) => item.id === id);
      return encontrado === undefined
        ? errorResponse("not_found", "No existe la ficha", 404)
        : jsonResponse(encontrado);
    }

    return errorResponse("not_found", "No existe la ruta", 404);
  });
};

const renderProyecto = (id = "P1") =>
  renderApp(`/proyectos/${id}`, new QueryClient({ defaultOptions: { queries: { retry: false } } }));

beforeEach(() => {
  localStorage.clear();
  listados = [];
  parches = [];
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("vista de proyecto", () => {
  it("muestra nombre, descripción, estado y enlace a la ficha completa", async () => {
    mockApi();
    renderProyecto();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Mi proyecto" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Objetivo" })).toBeInTheDocument();
    expect(screen.getByText("Terminar la app")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Editar ficha completa" })).toHaveAttribute(
      "href",
      "/objetos/P1",
    );
    expect(screen.getByRole("combobox", { name: "Estado del proyecto" })).toHaveValue("activo");
  });

  it("consulta los grupos con enlazadoA y muestra títulos, contadores y estados", async () => {
    mockApi({
      asociados: {
        nota: [objeto("nota", "N1", "Apuntes del proyecto"), objeto("nota", "N2", "Referencias")],
        tarea: [objeto("tarea", "T1", "Preparar despliegue", { estado: "pendiente" })],
        evento: [objeto("evento", "E1", "Reunión semanal")],
        recordatorio: [objeto("recordatorio", "R1", "Avisar al equipo", { estado: "vencido" })],
      },
    });
    const { router } = renderProyecto();
    const user = userEvent.setup();

    await screen.findByRole("link", { name: "Apuntes del proyecto" });

    for (const tipo of ["nota", "tarea", "evento", "recordatorio"]) {
      const consulta = listados.find((url) => url.searchParams.get("tipo") === tipo);
      expect(consulta?.searchParams.get("enlazadoA")).toBe("P1");
      expect(consulta?.searchParams.get("limite")).toBe("50");
    }

    expect(
      within(screen.getByRole("region", { name: "Notas" })).getByText("2"),
    ).toBeInTheDocument();
    const tareas = screen.getByRole("region", { name: "Tareas" });
    expect(within(tareas).getByText("1")).toBeInTheDocument();
    expect(within(tareas).getByText("pendiente")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Recordatorios" })).getByText("vencido"),
    ).toBeInTheDocument();
    const eventos = screen.getByRole("region", { name: "Eventos" });
    expect(within(eventos).getByRole("link", { name: "Reunión semanal" })).toBeInTheDocument();
    expect(within(eventos).queryByText("pendiente")).toBeNull();

    await user.click(screen.getByRole("link", { name: "Apuntes del proyecto" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/objetos/N1"));
  });

  it("cambia el estado del proyecto con PATCH", async () => {
    mockApi();
    renderProyecto();
    const user = userEvent.setup();

    await screen.findByRole("heading", { level: 1, name: "Mi proyecto" });
    const selector = screen.getByRole("combobox", { name: "Estado del proyecto" });
    await user.selectOptions(selector, "hecho");

    await waitFor(() => expect(parches).toHaveLength(1));
    expect(parches[0]).toEqual({ id: "P1", body: { atributos: { estado: "hecho" } } });
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Estado del proyecto" })).toHaveValue("hecho"),
    );
  });

  it("muestra la pista de wikilink cuando no hay elementos asociados", async () => {
    mockApi();
    renderProyecto();

    expect(await screen.findByText(/\[\[Mi proyecto\]\]/)).toBeInTheDocument();
    expect(screen.getAllByText("Ninguno asociado.")).toHaveLength(4);
  });
});
