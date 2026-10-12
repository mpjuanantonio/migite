import type { AttributePayload, TipoPayload } from "@migite/contracts";
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
  errorResponse,
  jsonResponse,
  noContentResponse,
  renderApp,
  sesionResponse,
} from "@/test/render-app";

type PatchTipoBody = {
  readonly nombre?: string;
  readonly descripcion?: string;
  readonly atributos?: AttributePayload[];
};

let fetchMock: Mock<typeof fetch>;
let tipos: TipoPayload[];
let patchados: { readonly id: string; readonly body: PatchTipoBody }[];
let borrados: string[];
let respuestaBorrado: Response | undefined;

const tipoLibro = (): TipoPayload => ({
  id: "libro",
  nombre: "Libro",
  descripcion: "Fichas de lectura",
  atributos: [
    { id: "autor", nombre: "Autor", tipo: "texto", obligatorio: true },
    {
      id: "genero",
      nombre: "Género",
      tipo: "seleccion",
      obligatorio: false,
      opciones: ["novela", "ensayo"],
    },
  ],
});

const tipoNota = (): TipoPayload => ({ id: "nota", nombre: "Nota", atributos: [] });

const llamadasBorrado = () =>
  fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") === "DELETE");

const mockApi = (): void => {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";

    if (url.pathname === "/api/sesion") {
      return sesionResponse(true);
    }

    if (url.pathname === "/api/tipos" && method === "GET") {
      return jsonResponse({ tipos });
    }

    if (url.pathname.startsWith("/api/tipos/") && method === "PATCH") {
      const id = decodeURIComponent(url.pathname.slice("/api/tipos/".length));
      const body = JSON.parse(String(init?.body ?? "{}")) as PatchTipoBody;
      patchados.push({ id, body });
      const actual = tipos.find((tipo) => tipo.id === id);
      if (actual === undefined) {
        return errorResponse("not_found", "No existe el tipo", 404);
      }
      const actualizado: TipoPayload = { ...actual, ...body };
      tipos = tipos.map((tipo) => (tipo.id === id ? actualizado : tipo));
      return jsonResponse(actualizado);
    }

    if (url.pathname.startsWith("/api/tipos/") && method === "DELETE") {
      const id = decodeURIComponent(url.pathname.slice("/api/tipos/".length));
      if (respuestaBorrado !== undefined) {
        return respuestaBorrado;
      }
      borrados.push(id);
      tipos = tipos.filter((tipo) => tipo.id !== id);
      return noContentResponse();
    }

    return errorResponse("not_found", "No existe la ruta", 404);
  });
};

const renderTipo = (path: string) =>
  renderApp(path, new QueryClient({ defaultOptions: { queries: { retry: false } } }));

beforeEach(() => {
  localStorage.clear();
  tipos = [tipoLibro(), tipoNota()];
  patchados = [];
  borrados = [];
  respuestaBorrado = undefined;
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("editor de tipo", () => {
  it("bloquea el tipo de campo de los atributos existentes", async () => {
    mockApi();
    renderTipo("/tipos/libro");
    const user = userEvent.setup();

    await screen.findByDisplayValue("Autor");
    const selects = screen.getAllByLabelText("Tipo de campo");
    expect(selects).toHaveLength(2);
    for (const select of selects) {
      expect(select).toBeDisabled();
    }
    expect(screen.getByLabelText("Opciones (separadas por comas)")).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Añadir atributo" }));
    const ampliados = screen.getAllByLabelText("Tipo de campo");
    expect(ampliados).toHaveLength(3);
    expect(ampliados[2]).toBeEnabled();
  });

  it("añade y quita atributos con aviso y guarda el PATCH con la lista completa", async () => {
    mockApi();
    renderTipo("/tipos/libro");
    const user = userEvent.setup();

    await screen.findByDisplayValue("Autor");
    await user.click(screen.getByRole("button", { name: "Añadir atributo" }));

    const nombres = screen.getAllByLabelText("Nombre");
    await user.type(nombres[nombres.length - 1] as HTMLElement, "Páginas");
    expect(screen.getByDisplayValue("paginas")).toBeInTheDocument();
    const selects = screen.getAllByLabelText("Tipo de campo");
    await user.selectOptions(selects[selects.length - 1] as HTMLElement, "numero");

    await user.click(screen.getByRole("button", { name: "Quitar atributo Autor" }));
    const dialogo = await screen.findByRole("dialog");
    expect(
      within(dialogo).getByText(
        "Los datos ya guardados en los objetos se conservan; el atributo quedará deprecado.",
      ),
    ).toBeInTheDocument();
    await user.click(within(dialogo).getByRole("button", { name: "Quitar atributo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(patchados).toHaveLength(1));
    expect(patchados[0]?.id).toBe("libro");
    expect(patchados[0]?.body).toEqual({
      nombre: "Libro",
      descripcion: "Fichas de lectura",
      atributos: [
        {
          id: "genero",
          nombre: "Género",
          tipo: "seleccion",
          obligatorio: false,
          opciones: ["novela", "ensayo"],
        },
        { id: "paginas", nombre: "Páginas", tipo: "numero", obligatorio: false },
      ],
    });
    expect(await screen.findByText("Cambios guardados")).toBeInTheDocument();
  });

  it("no borra el tipo sin confirmar y lo borra con confirmación", async () => {
    mockApi();
    const { router } = renderTipo("/tipos/libro");
    const user = userEvent.setup();

    await screen.findByDisplayValue("Autor");
    await user.click(screen.getByRole("button", { name: "Borrar tipo" }));

    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("¿Borrar «Libro»?")).toBeInTheDocument();
    expect(within(dialogo).getByText(/quedarán en modo degradado/)).toBeInTheDocument();
    expect(llamadasBorrado()).toHaveLength(0);

    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(llamadasBorrado()).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Borrar tipo" }));
    await user.click(await screen.findByRole("button", { name: "Borrar tipo definitivamente" }));

    await waitFor(() => expect(llamadasBorrado()).toHaveLength(1));
    const llamada = llamadasBorrado()[0];
    const url = new URL(String(llamada?.[0]), "http://localhost");
    expect(url.pathname).toBe("/api/tipos/libro");
    expect(url.searchParams.get("confirmar")).toBe("1");
    expect(borrados).toEqual(["libro"]);
    await waitFor(() => expect(router.state.location.pathname).toBe("/tipos"));
  });

  it("muestra el error del API si el borrado falla", async () => {
    respuestaBorrado = errorResponse("confirmation_required", "Confirma el borrado", 409);
    mockApi();
    renderTipo("/tipos/libro");
    const user = userEvent.setup();

    await screen.findByDisplayValue("Autor");
    await user.click(screen.getByRole("button", { name: "Borrar tipo" }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Borrar tipo definitivamente" }));

    expect(await within(dialogo).findByText("Confirma el borrado")).toBeInTheDocument();
    expect(borrados).toEqual([]);
  });

  it("muestra el error 404 del API si el tipo ya no existe", async () => {
    respuestaBorrado = errorResponse("not_found", "No existe el tipo", 404);
    mockApi();
    renderTipo("/tipos/libro");
    const user = userEvent.setup();

    await screen.findByDisplayValue("Autor");
    await user.click(screen.getByRole("button", { name: "Borrar tipo" }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Borrar tipo definitivamente" }));

    expect(await within(dialogo).findByText("No existe el tipo")).toBeInTheDocument();
  });

  it("muestra los tipos del sistema en solo lectura", async () => {
    mockApi();
    renderTipo("/tipos/nota");

    expect(
      await screen.findByText("Este tipo es del sistema: puedes consultarlo, pero no editarlo."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Añadir atributo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Borrar tipo" })).toBeNull();
    expect(screen.getByLabelText("Nombre")).toBeDisabled();
    expect(screen.getByLabelText("Identificador")).toBeDisabled();
    expect(screen.getByLabelText("Descripción (opcional)")).toBeDisabled();
  });
});
