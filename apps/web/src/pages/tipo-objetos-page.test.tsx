import type { CreateObjectBody, ObjectPayload, TipoPayload } from "@migite/contracts";
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { errorResponse, jsonResponse, renderApp, sesionResponse } from "@/test/render-app";

let fetchMock: Mock<typeof fetch>;

const tipoLibro: TipoPayload = {
  id: "libro",
  nombre: "Libro",
  atributos: [{ id: "autor", nombre: "Autor", tipo: "texto", obligatorio: false }],
};

const objeto = (
  id: string,
  titulo: string,
  actualizado: string,
  carpeta: string,
  extras: Partial<ObjectPayload> = {},
): ObjectPayload => ({
  id,
  tipo: "libro",
  titulo,
  ruta: carpeta === "" ? `${id}.md` : `${carpeta}/${id}.md`,
  carpeta,
  creado: "2026-10-01T10:00:00.000Z",
  actualizado,
  atributos: {},
  cuerpo: "",
  enlaces: [],
  degraded: [],
  ...extras,
});

type ApiOptions = {
  readonly tipos?: readonly TipoPayload[];
  readonly lista?: (url: URL) => Response;
  readonly detalle?: (id: string) => Response;
  readonly crear?: (body: CreateObjectBody) => Response;
};

const listados: URL[] = [];

const mockApi = (options: ApiOptions = {}): void => {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";

    if (url.pathname === "/api/tipos" && method === "GET") {
      return jsonResponse({ tipos: options.tipos ?? [tipoLibro] });
    }

    if (url.pathname === "/api/objetos" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as CreateObjectBody;
      return (
        options.crear?.(body) ??
        jsonResponse(
          objeto("NUEVA", body.titulo, "2026-10-07T09:00:00.000Z", body.carpeta ?? "", {
            tipo: body.tipo ?? "libro",
          }),
          201,
        )
      );
    }

    if (url.pathname.startsWith("/api/objetos/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/objetos/".length));
      return options.detalle?.(id) ?? errorResponse("not_found", "No existe la ficha", 404);
    }

    if (url.pathname === "/api/objetos") {
      listados.push(url);
      return options.lista?.(url) ?? jsonResponse({ objetos: [], siguienteCursor: null });
    }

    return sesionResponse(true);
  });
};

const ultimaLista = (): URL | undefined => listados.at(-1);

const filaDe = (titulo: string): HTMLElement => {
  const item = screen.getByRole("heading", { name: titulo }).closest("li");
  if (item === null) {
    throw new Error(`no se encontró la fila de "${titulo}"`);
  }
  return item;
};

const renderTipo = (ruta: string) =>
  renderApp(ruta, new QueryClient({ defaultOptions: { queries: { retry: false } } }));

const posteos = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");

beforeEach(() => {
  localStorage.clear();
  listados.length = 0;
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listado genérico de tipo", () => {
  it("lista los objetos del tipo con título, actualización y carpeta y navega al pulsar una fila", async () => {
    mockApi({
      lista: () =>
        jsonResponse({
          objetos: [
            objeto("A", "El Quijote", "2026-10-05T18:30:00.000Z", "libros"),
            objeto("B", "Ulises", "2026-10-03T09:00:00.000Z", ""),
          ],
          siguienteCursor: null,
        }),
      detalle: (id) => jsonResponse(objeto(id, "El Quijote", "2026-10-05T18:30:00.000Z", "libros")),
    });
    const user = userEvent.setup();
    const { router } = renderTipo("/tipo/libro");

    expect(await screen.findByRole("heading", { level: 1, name: "Libro" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Editar tipo" })).toHaveAttribute(
      "href",
      "/tipos/libro",
    );

    const lista = await screen.findByRole("list", { name: "Listado de objetos" });
    await waitFor(() => expect(ultimaLista()?.searchParams.get("tipo")).toBe("libro"));
    expect(ultimaLista()?.searchParams.get("limite")).toBe("20");

    const filas = within(lista).getAllByRole("listitem");
    expect(filas.map((fila) => within(fila).getByRole("heading").textContent)).toEqual([
      "El Quijote",
      "Ulises",
    ]);

    const primera = filaDe("El Quijote");
    expect(primera.querySelector("time")).toHaveAttribute("datetime", "2026-10-05T18:30:00.000Z");
    expect(within(primera).getByText("libros")).toBeInTheDocument();
    expect(within(filaDe("Ulises")).getByText("Sin carpeta")).toBeInTheDocument();

    await user.click(within(primera).getByRole("link"));

    await waitFor(() => expect(router.state.location.pathname).toBe("/objetos/A"));
    expect(
      await screen.findByRole("heading", { level: 1, name: "El Quijote" }),
    ).toBeInTheDocument();
  });

  it("pagina con Cargar más sin duplicar filas", async () => {
    mockApi({
      lista: (url) =>
        url.searchParams.get("cursor") === "cursor-1"
          ? jsonResponse({
              objetos: [
                objeto("B", "Ulises", "2026-10-03T09:00:00.000Z", "libros"),
                objeto("C", "Rayuela", "2026-10-02T09:00:00.000Z", "libros"),
              ],
              siguienteCursor: null,
            })
          : jsonResponse({
              objetos: [
                objeto("A", "El Quijote", "2026-10-05T18:30:00.000Z", "libros"),
                objeto("B", "Ulises", "2026-10-03T09:00:00.000Z", "libros"),
              ],
              siguienteCursor: "cursor-1",
            }),
    });
    const user = userEvent.setup();
    renderTipo("/tipo/libro");

    await screen.findByRole("heading", { name: "El Quijote" });
    await user.click(screen.getByRole("button", { name: "Cargar más" }));

    expect(await screen.findByRole("heading", { name: "Rayuela" })).toBeInTheDocument();
    await waitFor(() => expect(ultimaLista()?.searchParams.get("cursor")).toBe("cursor-1"));
    expect(
      within(screen.getByRole("list", { name: "Listado de objetos" })).getAllByRole("listitem"),
    ).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();
  });

  it("muestra el estado vacío", async () => {
    mockApi();
    renderTipo("/tipo/libro");

    expect(await screen.findByText("Todavía no hay objetos de este tipo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevo" })).toBeEnabled();
  });

  it("muestra el error de carga y permite reintentar", async () => {
    let intentos = 0;
    mockApi({
      lista: () => {
        intentos += 1;
        return intentos === 1
          ? errorResponse("read_error", "No se pudo leer el archivo", 500)
          : jsonResponse({
              objetos: [objeto("A", "El Quijote", "2026-10-05T18:30:00.000Z", "libros")],
              siguienteCursor: null,
            });
      },
    });
    const user = userEvent.setup();
    renderTipo("/tipo/libro");

    expect(
      await screen.findByRole("heading", { name: "No se pudieron cargar los objetos" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No se pudo leer el archivo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("heading", { name: "El Quijote" })).toBeInTheDocument();
  });

  it("abre el alta con el tipo fijado y crea el objeto", async () => {
    mockApi({
      tipos: [{ id: "libro", nombre: "Libro", atributos: [] }],
      detalle: (id) => jsonResponse(objeto(id, "El Quijote", "2026-10-07T09:00:00.000Z", "libros")),
    });
    const user = userEvent.setup();
    const { router } = renderTipo("/tipo/libro");

    await screen.findByRole("heading", { level: 1, name: "Libro" });
    await user.click(screen.getByRole("button", { name: "Nuevo" }));

    const dialogo = within(await screen.findByRole("dialog"));
    expect(dialogo.queryByLabelText("Tipo")).toBeNull();
    await user.type(dialogo.getByLabelText("Título"), "El Quijote");
    await user.click(dialogo.getByRole("button", { name: "Crear objeto" }));

    await waitFor(() => {
      const post = posteos()[0];
      expect(post?.[0]).toBe("/api/objetos");
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        tipo: "libro",
        titulo: "El Quijote",
      });
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/objetos/NUEVA"));
  });

  it("muestra un mensaje claro si el tipo no existe", async () => {
    mockApi();
    renderTipo("/tipo/inexistente");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Tipo no encontrado" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("El tipo «inexistente» no existe o se ha borrado."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Volver a tipos/ })).toHaveAttribute("href", "/tipos");
  });
});
