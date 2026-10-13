import type { CreateObjectBody, ObjectPayload } from "@migite/contracts";
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { errorResponse, jsonResponse, renderApp, sesionResponse } from "@/test/render-app";

let fetchMock: Mock<typeof fetch>;
let listados: URL[];
let creados: CreateObjectBody[];

type OpcionesProyecto = {
  readonly estado?: string;
  readonly cuerpo?: string;
  readonly actualizado?: string;
};

const proyecto = (id: string, titulo: string, opciones: OpcionesProyecto = {}): ObjectPayload => {
  const { estado = "activo", cuerpo = "", actualizado = "2026-10-05T10:00:00.000Z" } = opciones;
  return {
    id,
    tipo: "proyecto",
    titulo,
    ruta: `proyectos/${id}.md`,
    carpeta: "proyectos",
    creado: "2026-10-01T10:00:00.000Z",
    actualizado,
    atributos: { estado },
    cuerpo,
    enlaces: [],
    degraded: [],
  };
};

type MockApiOptions = {
  readonly proyectos?: readonly ObjectPayload[];
  readonly lista?: (url: URL) => Response | undefined;
};

const mockApi = (options: MockApiOptions = {}): void => {
  const proyectos = [...(options.proyectos ?? [])];

  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";

    if (url.pathname === "/api/sesion") {
      return sesionResponse(true);
    }

    if (url.pathname === "/api/objetos" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as CreateObjectBody;
      creados.push(body);
      const creado = proyecto("CREADO", body.titulo, {
        ...(body.cuerpo === undefined ? {} : { cuerpo: body.cuerpo }),
        ...(typeof body.atributos?.estado === "string" ? { estado: body.atributos.estado } : {}),
      });
      proyectos.unshift(creado);
      return jsonResponse(creado, 201);
    }

    if (url.pathname.startsWith("/api/objetos/") && method === "GET") {
      const id = decodeURIComponent(url.pathname.slice("/api/objetos/".length));
      const encontrado = proyectos.find((item) => item.id === id);
      return encontrado === undefined
        ? errorResponse("not_found", "No existe la ficha", 404)
        : jsonResponse(encontrado);
    }

    if (url.pathname === "/api/objetos") {
      listados.push(url);
      const respuesta = options.lista?.(url);
      if (respuesta !== undefined) {
        return respuesta;
      }
      const tipo = url.searchParams.get("tipo");
      const objetos = tipo === null ? proyectos : proyectos.filter((item) => item.tipo === tipo);
      return jsonResponse({ objetos, siguienteCursor: null });
    }

    if (url.pathname === "/api/tipos" && method === "GET") {
      return jsonResponse({ tipos: [] });
    }

    return errorResponse("not_found", "No existe la ruta", 404);
  });
};

const renderProyectos = () =>
  renderApp("/proyectos", new QueryClient({ defaultOptions: { queries: { retry: false } } }));

const filaDe = (titulo: string): HTMLElement => {
  const enlace = screen.getByRole("link", { name: titulo });
  const item = enlace.closest("li");
  if (item === null) {
    throw new Error(`no se encontró la fila de "${titulo}"`);
  }
  return item;
};

beforeEach(() => {
  localStorage.clear();
  listados = [];
  creados = [];
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listado de proyectos", () => {
  it("consulta los proyectos y muestra estado, resumen y actualización", async () => {
    mockApi({
      proyectos: [
        proyecto("A", "Reforma cocina", {
          estado: "activo",
          cuerpo: "Pintar y montar muebles\n\nDetalles internos",
        }),
        proyecto("B", "Viaje a Japón", { estado: "archivado" }),
      ],
    });
    renderProyectos();

    await screen.findByRole("link", { name: "Reforma cocina" });
    expect(listados[0]?.searchParams.get("tipo")).toBe("proyecto");
    expect(listados[0]?.searchParams.get("limite")).toBe("20");

    const fila = filaDe("Reforma cocina");
    expect(within(fila).getByRole("link")).toHaveAttribute("href", "/proyectos/A");
    expect(within(fila).getByText("activo")).toBeInTheDocument();
    expect(within(fila).getByText("Pintar y montar muebles")).toBeInTheDocument();
    expect(within(fila).queryByText("Detalles internos")).toBeNull();
    expect(fila.querySelector("time")).toHaveAttribute("datetime", "2026-10-05T10:00:00.000Z");

    expect(within(filaDe("Viaje a Japón")).getByText("archivado")).toBeInTheDocument();
  });

  it("muestra el estado vacío", async () => {
    mockApi();
    renderProyectos();

    expect(await screen.findByText("Aún no hay proyectos.")).toBeInTheDocument();
  });

  it("crea un proyecto con nombre y descripción y navega a su vista", async () => {
    mockApi();
    const { router } = renderProyectos();
    const user = userEvent.setup();

    await screen.findByText("Aún no hay proyectos.");
    await user.click(screen.getByRole("button", { name: "Nuevo proyecto" }));
    const dialogo = within(await screen.findByRole("dialog"));
    expect(dialogo.queryByLabelText("Estado")).toBeNull();
    expect(dialogo.queryByRole("option", { name: "hecho" })).toBeNull();
    expect(dialogo.queryByRole("option", { name: "archivado" })).toBeNull();
    await user.type(dialogo.getByLabelText("Nombre"), "Huerto urbano");
    await user.type(screen.getByLabelText("Descripción (opcional)"), "Preparar macetas y plantar");
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }));

    await waitFor(() => expect(creados).toHaveLength(1));
    expect(creados[0]).toEqual({
      tipo: "proyecto",
      titulo: "Huerto urbano",
      atributos: { estado: "activo" },
      cuerpo: "Preparar macetas y plantar",
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/proyectos/CREADO"));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Huerto urbano" }),
    ).toBeInTheDocument();
  });

  it("omite el cuerpo al crear si no hay descripción", async () => {
    mockApi();
    renderProyectos();
    const user = userEvent.setup();

    await screen.findByText("Aún no hay proyectos.");
    await user.click(screen.getByRole("button", { name: "Nuevo proyecto" }));
    await user.type(await screen.findByLabelText("Nombre"), "Solo nombre");
    await user.click(screen.getByRole("button", { name: "Crear proyecto" }));

    await waitFor(() => expect(creados).toHaveLength(1));
    expect(creados[0]).toEqual({
      tipo: "proyecto",
      titulo: "Solo nombre",
      atributos: { estado: "activo" },
    });
  });

  it("pagina con Cargar más sin duplicar fichas", async () => {
    mockApi({
      lista: (url) => {
        if (url.searchParams.get("cursor") === "cursor-1") {
          return jsonResponse({ objetos: [proyecto("C", "Tercero")], siguienteCursor: null });
        }
        return jsonResponse({
          objetos: [proyecto("A", "Primero"), proyecto("B", "Segundo")],
          siguienteCursor: "cursor-1",
        });
      },
    });
    renderProyectos();
    const user = userEvent.setup();

    await screen.findByRole("link", { name: "Primero" });
    await user.click(screen.getByRole("button", { name: "Cargar más" }));

    await screen.findByRole("link", { name: "Tercero" });
    expect(listados.at(-1)?.searchParams.get("cursor")).toBe("cursor-1");
    expect(within(screen.getByRole("main")).getAllByRole("listitem")).toHaveLength(3);
    expect(within(screen.getByRole("main")).getAllByRole("link", { name: "Segundo" })).toHaveLength(
      1,
    );
    expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();
  });
});
