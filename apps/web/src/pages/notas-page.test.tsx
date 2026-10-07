import type { CreateObjectBody, ObjectPayload } from "@migite/contracts";
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { errorResponse, jsonResponse, renderApp, sesionResponse } from "@/test/render-app";

let fetchMock: Mock<typeof fetch>;

const nota = (
  id: string,
  titulo: string,
  actualizado: string,
  carpeta: string,
  extras: Partial<ObjectPayload> = {},
): ObjectPayload => ({
  id,
  tipo: "nota",
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
  readonly lista?: (url: URL, intento: number) => Response;
  readonly detalle?: (id: string) => Response;
  readonly crear?: (body: CreateObjectBody, intento: number) => Response;
};

const mockApi = (options: ApiOptions = {}): void => {
  let intentosLista = 0;
  let intentosCrear = 0;

  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      "http://localhost",
    );
    const method = init?.method ?? "GET";

    if (url.pathname === "/api/objetos" && method === "POST") {
      intentosCrear += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as CreateObjectBody;
      return (
        options.crear?.(body, intentosCrear) ??
        jsonResponse(
          nota("CREADA", body.titulo, "2026-10-07T09:00:00.000Z", body.carpeta ?? ""),
          201,
        )
      );
    }

    if (url.pathname.startsWith("/api/objetos/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/objetos/".length));
      return options.detalle?.(id) ?? errorResponse("not_found", "No existe la ficha", 404);
    }

    if (url.pathname === "/api/objetos") {
      intentosLista += 1;
      return (
        options.lista?.(url, intentosLista) ?? jsonResponse({ objetos: [], siguienteCursor: null })
      );
    }

    return sesionResponse(true);
  });
};

const renderNotas = () =>
  renderApp("/notas", new QueryClient({ defaultOptions: { queries: { retry: false } } }));

const filaDe = (titulo: string): HTMLElement => {
  const item = screen.getByRole("heading", { name: titulo }).closest("li");
  if (item === null) {
    throw new Error(`no se encontró la fila de "${titulo}"`);
  }
  return item;
};

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listado de notas", () => {
  it("muestra título, actualización y carpeta ordenados, con la marca de degradado, y navega al hacer click", async () => {
    mockApi({
      lista: () =>
        jsonResponse({
          objetos: [
            nota("A", "Diario de campo", "2026-10-05T18:30:00.000Z", "diario"),
            nota("B", "Plan anual", "2026-10-03T09:00:00.000Z", "proyectos", {
              degraded: [{ kind: "unknownType", type: "misterio" }],
            }),
          ],
          siguienteCursor: null,
        }),
      detalle: (id) =>
        jsonResponse(
          id === "A"
            ? nota("A", "Diario de campo", "2026-10-05T18:30:00.000Z", "diario")
            : nota("B", "Plan anual", "2026-10-03T09:00:00.000Z", "proyectos"),
        ),
    });
    const user = userEvent.setup();
    const { router } = renderNotas();

    const main = await screen.findByRole("main");
    expect(
      await within(main).findByRole("heading", { name: "Diario de campo" }),
    ).toBeInTheDocument();

    const filas = within(main).getAllByRole("listitem");
    expect(filas.map((fila) => within(fila).getByRole("heading").textContent)).toEqual([
      "Diario de campo",
      "Plan anual",
    ]);

    const primera = filaDe("Diario de campo");
    expect(primera.querySelector("time")).toHaveAttribute("datetime", "2026-10-05T18:30:00.000Z");
    expect(primera.querySelector("time")?.textContent).not.toBe("");
    expect(within(primera).getByText("diario")).toBeInTheDocument();

    const segunda = filaDe("Plan anual");
    expect(within(segunda).getByText("proyectos")).toBeInTheDocument();
    expect(within(segunda).getByText("Degradado")).toBeInTheDocument();

    await user.click(within(primera).getByRole("link"));

    await waitFor(() => expect(router.state.location.pathname).toBe("/objetos/A"));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Diario de campo" }),
    ).toBeInTheDocument();
  });

  it("filtra por carpeta y cambia la query dejando las carpetas conocidas", async () => {
    mockApi({
      lista: (url) => {
        if (url.searchParams.get("carpeta") === "diario") {
          return jsonResponse({
            objetos: [nota("A", "Diario de campo", "2026-10-05T18:30:00.000Z", "diario")],
            siguienteCursor: null,
          });
        }
        return jsonResponse({
          objetos: [
            nota("A", "Diario de campo", "2026-10-05T18:30:00.000Z", "diario"),
            nota("B", "Plan anual", "2026-10-03T09:00:00.000Z", "proyectos"),
          ],
          siguienteCursor: null,
        });
      },
    });
    const user = userEvent.setup();
    renderNotas();

    const main = await screen.findByRole("main");
    await within(main).findByRole("heading", { name: "Plan anual" });

    await user.click(screen.getByRole("button", { name: "diario" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes("carpeta=diario"))).toBe(
        true,
      ),
    );
    await waitFor(() =>
      expect(within(main).queryByRole("heading", { name: "Plan anual" })).toBeNull(),
    );
    expect(within(main).getByRole("heading", { name: "Diario de campo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "proyectos" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Todas" }));

    expect(await within(main).findByRole("heading", { name: "Plan anual" })).toBeInTheDocument();
  });

  it("pagina con Cargar más sin duplicar filas", async () => {
    mockApi({
      lista: (url) => {
        if (url.searchParams.get("cursor") === "cursor-1") {
          return jsonResponse({
            objetos: [
              nota("B", "Segunda", "2026-10-04T10:00:00.000Z", "diario"),
              nota("C", "Tercera", "2026-10-02T10:00:00.000Z", "diario"),
            ],
            siguienteCursor: null,
          });
        }
        return jsonResponse({
          objetos: [
            nota("A", "Primera", "2026-10-06T10:00:00.000Z", "diario"),
            nota("B", "Segunda", "2026-10-04T10:00:00.000Z", "diario"),
          ],
          siguienteCursor: "cursor-1",
        });
      },
    });
    const user = userEvent.setup();
    renderNotas();

    const main = await screen.findByRole("main");
    await within(main).findByRole("heading", { name: "Primera" });

    await user.click(screen.getByRole("button", { name: "Cargar más" }));

    await within(main).findByRole("heading", { name: "Tercera" });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes("cursor=cursor-1")),
      ).toBe(true),
    );
    expect(within(main).getAllByRole("listitem")).toHaveLength(3);
    expect(within(main).getAllByRole("heading", { name: "Segunda" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();
  });

  it("muestra el estado vacío", async () => {
    mockApi();
    renderNotas();

    expect(await screen.findByText(/Todavía no hay notas/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva nota" })).toBeEnabled();
  });

  it("crea una nota con título localizado y navega a la ficha", async () => {
    mockApi({
      detalle: (id) => jsonResponse(nota(id, "Nota sin título", "2026-10-07T09:00:00.000Z", "")),
      crear: (body) =>
        jsonResponse(nota("NUEVA", body.titulo, "2026-10-07T09:00:00.000Z", ""), 201),
    });
    const user = userEvent.setup();
    const { router } = renderNotas();

    await screen.findByText(/Todavía no hay notas/);
    await user.click(screen.getByRole("button", { name: "Nueva nota" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(post?.[0]).toBe("/api/objetos");
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({ titulo: "Nota sin título" });
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/objetos/NUEVA"));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Nota sin título" }),
    ).toBeInTheDocument();
  });

  it("crea la nota dentro de la carpeta filtrada", async () => {
    mockApi({
      lista: () =>
        jsonResponse({
          objetos: [nota("B", "Plan anual", "2026-10-03T09:00:00.000Z", "proyectos")],
          siguienteCursor: null,
        }),
      detalle: (id) =>
        jsonResponse(nota(id, "Nota sin título", "2026-10-07T09:00:00.000Z", "proyectos")),
      crear: (body) =>
        jsonResponse(
          nota("NUEVA", body.titulo, "2026-10-07T09:00:00.000Z", body.carpeta ?? ""),
          201,
        ),
    });
    const user = userEvent.setup();
    renderNotas();

    await screen.findByRole("heading", { name: "Plan anual" });
    await user.click(screen.getByRole("button", { name: "proyectos" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes("carpeta=proyectos")),
      ).toBe(true),
    );

    await user.click(screen.getByRole("button", { name: "Nueva nota" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        titulo: "Nota sin título",
        carpeta: "proyectos",
      });
    });
  });

  it("filtra la raíz en el cliente cuando el API no distingue carpeta vacía", async () => {
    mockApi({
      lista: () =>
        jsonResponse({
          objetos: [
            nota("A", "Suelta", "2026-10-05T10:00:00.000Z", ""),
            nota("B", "En diario", "2026-10-04T10:00:00.000Z", "diario"),
          ],
          siguienteCursor: null,
        }),
    });
    const user = userEvent.setup();
    renderNotas();

    const main = await screen.findByRole("main");
    await within(main).findByRole("heading", { name: "Suelta" });

    await user.click(screen.getByRole("button", { name: "Raíz" }));

    await waitFor(() =>
      expect(within(main).queryByRole("heading", { name: "En diario" })).toBeNull(),
    );
    expect(within(main).getByRole("heading", { name: "Suelta" })).toBeInTheDocument();
    expect(within(main).getAllByRole("listitem")).toHaveLength(1);
  });

  it("muestra el error de carga y permite reintentar", async () => {
    mockApi({
      lista: (_url, intento) =>
        intento === 1
          ? errorResponse("read_error", "No se pudo leer el archivo", 500)
          : jsonResponse({
              objetos: [nota("A", "Recuperada", "2026-10-05T10:00:00.000Z", "diario")],
              siguienteCursor: null,
            }),
    });
    const user = userEvent.setup();
    renderNotas();

    expect(
      await screen.findByRole("heading", { name: "No se pudieron cargar las notas" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No se pudo leer el archivo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nueva nota" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("heading", { name: "Recuperada" })).toBeInTheDocument();
  });
});
