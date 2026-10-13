import type { TipoPayload } from "@migite/contracts";
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { errorResponse, jsonResponse, renderApp, sesionResponse } from "@/test/render-app";

let fetchMock: Mock<typeof fetch>;
let tipos: TipoPayload[];
let creados: TipoPayload[];

const tipoNota = (): TipoPayload => ({
  id: "nota",
  nombre: "Nota",
  descripcion: "Ficha de texto libre",
  atributos: [
    {
      id: "estado",
      nombre: "Estado",
      tipo: "seleccion",
      obligatorio: false,
      opciones: ["abierta", "cerrada"],
    },
  ],
});

const tipoLibro = (): TipoPayload => ({ id: "libro", nombre: "Libro", atributos: [] });

const mockApi = (): void => {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";

    if (url.pathname === "/api/sesion") {
      return sesionResponse(true);
    }

    if (url.pathname === "/api/tipos" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as TipoPayload;
      creados.push(body);
      tipos = [...tipos, body];
      return jsonResponse(body, 201);
    }

    if (url.pathname === "/api/tipos" && method === "GET") {
      return jsonResponse({ tipos });
    }

    return errorResponse("not_found", "No existe la ruta", 404);
  });
};

const renderTipos = (path = "/tipos") =>
  renderApp(path, new QueryClient({ defaultOptions: { queries: { retry: false } } }));

beforeEach(() => {
  localStorage.clear();
  tipos = [tipoNota(), tipoLibro()];
  creados = [];
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listado de tipos", () => {
  it("muestra una ficha por tipo con el chip de sistema y el número de atributos", async () => {
    mockApi();
    renderTipos();

    const enlaceNota = await screen.findByRole("link", { name: "Nota" });
    expect(enlaceNota).toHaveAttribute("href", "/tipos/nota");
    const filaNota = enlaceNota.closest("li");
    expect(filaNota).not.toBeNull();
    expect(within(filaNota as HTMLElement).getByText("Sistema")).toBeInTheDocument();
    expect(within(filaNota as HTMLElement).getByText("Atributos: 1")).toBeInTheDocument();

    const enlaceLibro = screen.getByRole("link", { name: "Libro" });
    expect(enlaceLibro).toHaveAttribute("href", "/tipos/libro");
    const filaLibro = enlaceLibro.closest("li");
    expect(filaLibro).not.toBeNull();
    expect(within(filaLibro as HTMLElement).queryByText("Sistema")).toBeNull();
    expect(within(filaLibro as HTMLElement).getByText("Atributos: 0")).toBeInTheDocument();
    expect(within(filaLibro as HTMLElement).getByText("Sin descripción")).toBeInTheDocument();
  });

  it("crea un tipo con el identificador sugerido y navega a su editor", async () => {
    mockApi();
    const { router } = renderTipos();
    const user = userEvent.setup();

    await screen.findByRole("link", { name: "Libro" });
    await user.click(screen.getByRole("link", { name: "Nuevo tipo" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/tipos/nuevo"));

    await user.type(screen.getByLabelText("Nombre"), "Libro de recetas");
    expect(screen.getByLabelText("Identificador")).toHaveValue("libro-de-recetas");

    await user.clear(screen.getByLabelText("Identificador"));
    await user.type(screen.getByLabelText("Identificador"), "recetario");
    await user.type(screen.getByLabelText("Nombre"), " ilustrado");
    expect(screen.getByLabelText("Identificador")).toHaveValue("recetario");

    await user.click(screen.getByRole("button", { name: "Crear tipo" }));
    await waitFor(() => expect(creados).toHaveLength(1));
    expect(creados[0]).toEqual({
      id: "recetario",
      nombre: "Libro de recetas ilustrado",
      atributos: [],
      presentacion: { visible: true },
    });

    await waitFor(() => expect(router.state.location.pathname).toBe("/tipos/recetario"));
    expect(await screen.findByDisplayValue("Libro de recetas ilustrado")).toBeInTheDocument();
  });
});
