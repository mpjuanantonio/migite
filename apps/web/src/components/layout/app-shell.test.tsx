import type { ArbolObjetoNode, ObjectPayload, TipoPayload } from "@migite/contracts";
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

const objetoNota = (id: string, titulo: string, carpeta: string): ObjectPayload => ({
  id,
  tipo: "nota",
  titulo,
  ruta: carpeta === "" ? `${id}.md` : `${carpeta}/${id}.md`,
  carpeta,
  creado: "2026-10-01T10:00:00.000Z",
  actualizado: "2026-10-05T18:30:00.000Z",
  atributos: {},
  cuerpo: "",
  enlaces: [],
  degraded: [],
});

const NODO_DIARIO: ArbolObjetoNode = {
  id: "N1",
  tipo: "nota",
  titulo: "Diario",
  ruta: "N1.md",
  carpeta: "",
  actualizado: "2026-10-01T10:00:00.000Z",
};

type MockApiOptions = {
  readonly arbol?: readonly ArbolObjetoNode[];
  readonly detalle?: (id: string) => Response;
};

const mockApi = (options: MockApiOptions = {}): void => {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/tipos") {
      return jsonResponse({ tipos: TIPOS });
    }
    if (url.pathname === "/api/objetos/arbol") {
      return jsonResponse({ nodos: options.arbol ?? [] });
    }
    if (url.pathname.startsWith("/api/objetos/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/objetos/".length));
      return options.detalle?.(id) ?? sesionResponse(true);
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
      "Chat",
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

const sigueA = (origen: HTMLElement, destino: HTMLElement): boolean =>
  (origen.compareDocumentPosition(destino) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe("barra lateral secundaria", () => {
  it("despliega el explorador junto al rail al pulsar Notas, con el contenido a la derecha", async () => {
    mockApi({ arbol: [NODO_DIARIO] });
    const user = userEvent.setup();
    const { router } = renderShell("/tareas");

    expect(screen.queryByRole("complementary", { name: "Explorador" })).toBeNull();

    const rail = await navPrincipal();
    await user.click(within(rail).getByRole("link", { name: "Notas" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/notas"));
    const explorador = await screen.findByRole("complementary", { name: "Explorador" });
    const main = screen.getByRole("main");

    expect(sigueA(rail, explorador)).toBe(true);
    expect(sigueA(explorador, main)).toBe(true);
    expect(await within(explorador).findByRole("link", { name: "Diario" })).toBeInTheDocument();
  });

  it("mantiene la barra al abrir una nota y deja el árbol fuera del contenido", async () => {
    mockApi({
      arbol: [NODO_DIARIO],
      detalle: (id) => jsonResponse(objetoNota(id, "Diario", "")),
    });
    const user = userEvent.setup();
    const { router } = renderShell("/notas");

    const explorador = await screen.findByRole("complementary", { name: "Explorador" });
    await user.click(await within(explorador).findByRole("link", { name: "Diario" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/objetos/N1"));
    expect(await screen.findByRole("heading", { level: 1, name: "Diario" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Explorador" })).toBeInTheDocument();

    const main = screen.getByRole("main");
    expect(within(main).queryByRole("list", { name: "Árbol de notas" })).toBeNull();
    expect(screen.getByRole("list", { name: "Árbol de notas" })).toBeInTheDocument();
  });

  it("oculta la barra al cambiar a una sección de productividad", async () => {
    mockApi({ arbol: [NODO_DIARIO] });
    const user = userEvent.setup();
    const { router } = renderShell("/notas");

    await screen.findByRole("complementary", { name: "Explorador" });

    const rail = await navPrincipal();
    await user.click(within(rail).getByRole("link", { name: "Tareas" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/tareas"));
    expect(screen.queryByRole("complementary", { name: "Explorador" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mostrar explorador" })).toBeNull();
  });

  it("en móvil arranca colapsada y al abrirla se superpone sin ocupar el contenido", async () => {
    mockApi({ arbol: [NODO_DIARIO] });
    const ancho = vi.spyOn(window, "innerWidth", "get").mockReturnValue(500);
    const user = userEvent.setup();
    renderShell("/notas");

    const main = await screen.findByRole("main");
    expect(await within(main).findByRole("heading", { name: "Notas" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Explorador" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Mostrar explorador" }));

    const explorador = await screen.findByRole("complementary", { name: "Explorador" });
    expect(explorador.className).toContain("max-lg:fixed");
    expect(screen.getByRole("main")).toBeInTheDocument();
    ancho.mockRestore();
  });
});
