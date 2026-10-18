import type { Memoria } from "@migite/contracts";
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

let fetchMock: Mock<typeof fetch>;
let memorias: Memoria[];
let parches: { readonly id: string; readonly body: unknown }[];
let borrados: string[];

const UNA_FECHA = "2026-10-05T18:30:00.000Z";

const memoria = (id: string, clave: string, contenido: string): Memoria => ({
  id,
  clave,
  contenido,
  actualizada: UNA_FECHA,
});

const CONTENIDO_LARGO =
  "Prefiere las fichas de archivo al estilo clásico, con notas breves y enlaces entre ideas. " +
  "Escribe por la mañana y revisa sus pendientes antes de dormir. " +
  "Le gusta que las respuestas del agente sean directas y con ejemplos.";

const mockApi = (): void => {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";

    if (url.pathname === "/api/sesion") {
      return sesionResponse(true);
    }
    if (url.pathname === "/api/tipos") {
      return jsonResponse({ tipos: [] });
    }
    if (url.pathname === "/api/objetos") {
      return jsonResponse({ objetos: [], siguienteCursor: null });
    }
    if (url.pathname === "/api/objetos/arbol") {
      return jsonResponse({ nodos: [] });
    }
    if (url.pathname === "/api/memorias" && method === "GET") {
      return jsonResponse({ memorias });
    }
    if (url.pathname.startsWith("/api/memorias/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/memorias/".length));
      if (method === "PATCH") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { readonly contenido?: string };
        parches.push({ id, body });
        memorias = memorias.map((item) =>
          item.id === id ? { ...item, contenido: body.contenido ?? "" } : item,
        );
        return jsonResponse(memorias.find((item) => item.id === id));
      }
      if (method === "DELETE") {
        borrados.push(id);
        memorias = memorias.filter((item) => item.id !== id);
        return noContentResponse();
      }
    }
    return errorResponse("not_found", "No existe la ruta", 404);
  });
};

const renderMemoria = (path = "/memoria") =>
  renderApp(path, new QueryClient({ defaultOptions: { queries: { retry: false } } }));

const fichaDe = (clave: string): HTMLElement => {
  const ficha = screen.getByRole("heading", { level: 2, name: clave }).closest("article");
  if (ficha === null) {
    throw new Error(`no se encontró la ficha de «${clave}»`);
  }
  return ficha;
};

beforeEach(() => {
  localStorage.clear();
  memorias = [
    memoria("m1", "color favorito", "verde oscuro"),
    memoria("m2", "estilo de escritura", CONTENIDO_LARGO),
  ];
  parches = [];
  borrados = [];
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("página de memoria del agente", () => {
  it("lista las memorias con clave, contenido y fecha, y expande el texto largo", async () => {
    mockApi();
    const user = userEvent.setup();
    renderMemoria();

    const lista = await screen.findByRole("list", { name: "Memorias del agente" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);

    const fichaCorta = fichaDe("color favorito");
    expect(within(fichaCorta).getByText("verde oscuro")).toBeInTheDocument();
    expect(within(fichaCorta).getByText(/^Actualizada el /)).toBeInTheDocument();
    expect(within(fichaCorta).queryByRole("button", { name: "Ver más" })).toBeNull();

    const fichaLarga = fichaDe("estilo de escritura");
    const parrafo = within(fichaLarga).getByText(CONTENIDO_LARGO);
    expect(parrafo).toHaveClass("line-clamp-2");

    await user.click(within(fichaLarga).getByRole("button", { name: "Ver más" }));

    expect(parrafo).not.toHaveClass("line-clamp-2");
    expect(within(fichaLarga).getByRole("button", { name: "Ver menos" })).toBeInTheDocument();
  });

  it("edita el contenido con PATCH y refresca la lista", async () => {
    mockApi();
    const user = userEvent.setup();
    renderMemoria();

    await screen.findByRole("heading", { level: 2, name: "color favorito" });
    await user.click(screen.getByRole("button", { name: "Editar «color favorito»" }));

    const editor = screen.getByLabelText("Contenido de «color favorito»");
    expect(editor).toHaveValue("verde oscuro");

    await user.clear(editor);
    await user.type(editor, "azul marino");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(parches).toHaveLength(1));
    expect(parches[0]).toEqual({ id: "m1", body: { contenido: "azul marino" } });
    await waitFor(() =>
      expect(screen.queryByLabelText("Contenido de «color favorito»")).toBeNull(),
    );
    expect(await screen.findByText("azul marino")).toBeInTheDocument();
    expect(screen.queryByText("verde oscuro")).toBeNull();
  });

  it("limita la edición del contenido al tope de 4000 caracteres", async () => {
    mockApi();
    const user = userEvent.setup();
    renderMemoria();

    await screen.findByRole("heading", { level: 2, name: "color favorito" });
    await user.click(screen.getByRole("button", { name: "Editar «color favorito»" }));

    const editor = screen.getByLabelText("Contenido de «color favorito»");
    expect(editor).toHaveAttribute("maxlength", "4000");
  });

  it("borra una memoria con confirmación y refresca la lista", async () => {
    mockApi();
    const user = userEvent.setup();
    renderMemoria();

    await screen.findByRole("heading", { level: 2, name: "color favorito" });
    await user.click(screen.getByRole("button", { name: "Borrar «color favorito»" }));
    expect(screen.getByText("¿Borrar esta memoria?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Borrar" }));

    await waitFor(() => expect(borrados).toEqual(["m1"]));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { level: 2, name: "color favorito" })).toBeNull(),
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "estilo de escritura" }),
    ).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando el agente no recuerda nada", async () => {
    memorias = [];
    mockApi();
    renderMemoria();

    expect(
      await screen.findByText(
        "El agente aún no recuerda nada. Propónle que guarde algo en el chat.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Memorias del agente" })).toBeNull();
  });

  it("muestra el error 404 del servidor al editar una memoria que ya no existe", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      if (url.pathname === "/api/sesion") {
        return sesionResponse(true);
      }
      if (url.pathname === "/api/tipos") {
        return jsonResponse({ tipos: [] });
      }
      if (url.pathname === "/api/memorias" && method === "GET") {
        return jsonResponse({ memorias: [memoria("m1", "color favorito", "verde oscuro")] });
      }
      if (url.pathname === "/api/memorias/m1" && method === "PATCH") {
        return errorResponse("memory_not_found", "La memoria ya no existe", 404);
      }
      return errorResponse("not_found", "No existe la ruta", 404);
    });
    const user = userEvent.setup();
    renderMemoria();

    await screen.findByRole("heading", { level: 2, name: "color favorito" });
    await user.click(screen.getByRole("button", { name: "Editar «color favorito»" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La memoria ya no existe");
  });

  it("redirige al acceso cuando la API responde 401", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/memorias") {
        return errorResponse("unauthorized", "Se requiere autenticación", 401);
      }
      if (url.pathname === "/api/tipos") {
        return jsonResponse({ tipos: [] });
      }
      if (url.pathname === "/api/objetos") {
        return jsonResponse({ objetos: [], siguienteCursor: null });
      }
      if (url.pathname === "/api/objetos/arbol") {
        return jsonResponse({ nodos: [] });
      }
      return sesionResponse(true);
    });
    const { router } = renderMemoria();

    await waitFor(() => expect(router.state.location.pathname).toBe("/notas"));
    expect(await screen.findByRole("heading", { level: 1, name: "Notas" })).toBeInTheDocument();
  });

  it("navega desde el rail a la memoria del agente", async () => {
    mockApi();
    const user = userEvent.setup();
    const { router } = renderMemoria("/notas");

    const nav = await screen.findByRole("navigation", { name: "Navegación principal" });
    await user.click(within(nav).getByRole("link", { name: "Memoria" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/memoria"));
    expect(await screen.findByRole("heading", { level: 1, name: "Memoria" })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { level: 2, name: "color favorito" }),
    ).toBeInTheDocument();
  });
});
