import type { CreateObjectBody, ObjectPayload, TipoPayload } from "@migite/contracts";
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

const tipoNota: TipoPayload = { id: "nota", nombre: "Nota", atributos: [] };

const tipoLibro: TipoPayload = {
  id: "libro",
  nombre: "Libro",
  atributos: [
    { id: "autor", nombre: "Autor", tipo: "texto", obligatorio: true },
    {
      id: "genero",
      nombre: "Género",
      tipo: "seleccion",
      obligatorio: false,
      opciones: ["novela", "ensayo"],
    },
    {
      id: "etiquetas",
      nombre: "Etiquetas",
      tipo: "multi-seleccion",
      obligatorio: false,
      opciones: ["clásico", "moderno"],
    },
    { id: "leido", nombre: "Leído", tipo: "booleano", obligatorio: false },
  ],
};

const tipoTarea: TipoPayload = {
  id: "tarea",
  nombre: "Tarea",
  atributos: [
    {
      id: "estado",
      nombre: "Estado",
      tipo: "seleccion",
      rol: "estado",
      obligatorio: true,
      opciones: ["pendiente", "en curso", "hecha"],
    },
    { id: "vencimiento", nombre: "Vencimiento", tipo: "fecha", obligatorio: false },
    { id: "completada", nombre: "Completada", tipo: "fecha-hora", obligatorio: false },
  ],
};

const tipoRecordatorio: TipoPayload = {
  id: "recordatorio",
  nombre: "Recordatorio",
  atributos: [
    { id: "hora", nombre: "Hora", tipo: "fecha-hora", rol: "hora", obligatorio: true },
    {
      id: "estado",
      nombre: "Estado",
      tipo: "seleccion",
      obligatorio: true,
      opciones: ["pendiente", "vencido"],
    },
  ],
};

type ApiOptions = {
  readonly lista?: (url: URL, intento: number) => Response;
  readonly detalle?: (id: string) => Response;
  readonly crear?: (body: CreateObjectBody, intento: number) => Response;
  readonly tipos?: readonly TipoPayload[];
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

    if (url.pathname === "/api/tipos" && method === "GET") {
      return jsonResponse({ tipos: options.tipos ?? [tipoNota] });
    }

    if (url.pathname === "/api/objetos" && method === "POST") {
      intentosCrear += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as CreateObjectBody;
      return (
        options.crear?.(body, intentosCrear) ??
        jsonResponse(
          nota("CREADA", body.titulo, "2026-10-07T09:00:00.000Z", body.carpeta ?? "", {
            tipo: body.tipo ?? "nota",
            atributos: body.atributos ?? {},
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
      intentosLista += 1;
      return (
        options.lista?.(url, intentosLista) ?? jsonResponse({ objetos: [], siguienteCursor: null })
      );
    }

    return sesionResponse(true);
  });
};

const posteos = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");

const dialogo = () => within(screen.getByRole("dialog"));

const rellenar = async (
  user: ReturnType<typeof userEvent.setup>,
  etiqueta: string | RegExp,
  texto: string,
): Promise<void> => {
  await user.type(dialogo().getByLabelText(etiqueta), texto);
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

const ultimaLista = (): URL | undefined => {
  const llamadas = fetchMock.mock.calls.filter(([input, init]) => {
    const url = new URL(String(input), "http://localhost");
    return url.pathname === "/api/objetos" && (init?.method ?? "GET") === "GET";
  });
  const ultima = llamadas.at(-1);
  return ultima === undefined ? undefined : new URL(String(ultima[0]), "http://localhost");
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

  it("muestra las etiquetas de cada fila y resume con +N las que sobran", async () => {
    mockApi({
      lista: () =>
        jsonResponse({
          objetos: [
            nota("A", "Diario de campo", "2026-10-05T18:30:00.000Z", "diario", {
              atributos: { etiquetas: ["casa", "trabajo", "urgente", "personal"] },
            }),
            nota("B", "Plan anual", "2026-10-03T09:00:00.000Z", "proyectos"),
          ],
          siguienteCursor: null,
        }),
    });
    renderNotas();

    const main = await screen.findByRole("main");
    await within(main).findByRole("heading", { name: "Diario de campo" });

    const primera = filaDe("Diario de campo");
    expect(within(primera).getByRole("button", { name: "casa" })).toBeInTheDocument();
    expect(within(primera).getByRole("button", { name: "trabajo" })).toBeInTheDocument();
    expect(within(primera).getByRole("button", { name: "urgente" })).toBeInTheDocument();
    expect(within(primera).queryByRole("button", { name: "personal" })).toBeNull();
    expect(within(primera).getByText("+1")).toBeInTheDocument();

    expect(within(filaDe("Plan anual")).queryAllByRole("button")).toHaveLength(0);
  });

  it("filtra por etiqueta al pulsar un chip de la fila y quita el filtro con la ✕", async () => {
    mockApi({
      lista: (url) =>
        url.searchParams.get("tag") === "casa"
          ? jsonResponse({
              objetos: [
                nota("A", "Diario de campo", "2026-10-05T18:30:00.000Z", "diario", {
                  atributos: { etiquetas: ["casa"] },
                }),
              ],
              siguienteCursor: null,
            })
          : jsonResponse({
              objetos: [
                nota("A", "Diario de campo", "2026-10-05T18:30:00.000Z", "diario", {
                  atributos: { etiquetas: ["casa"] },
                }),
                nota("B", "Plan anual", "2026-10-03T09:00:00.000Z", "proyectos"),
              ],
              siguienteCursor: null,
            }),
    });
    const user = userEvent.setup();
    const { router } = renderNotas();

    const main = await screen.findByRole("main");
    await within(main).findByRole("heading", { name: "Plan anual" });

    await user.click(within(filaDe("Diario de campo")).getByRole("button", { name: "casa" }));

    expect(router.state.location.pathname).toBe("/notas");
    await waitFor(() => expect(ultimaLista()?.searchParams.get("tag")).toBe("casa"));
    await waitFor(() =>
      expect(within(main).queryByRole("heading", { name: "Plan anual" })).toBeNull(),
    );
    expect(within(main).getByRole("heading", { name: "Diario de campo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quitar el filtro «casa»" }));

    expect(await within(main).findByRole("heading", { name: "Plan anual" })).toBeInTheDocument();
    await waitFor(() => expect(ultimaLista()?.searchParams.get("tag")).toBeNull());
  });

  it("filtra por la etiqueta escrita y la combina con la carpeta", async () => {
    mockApi({
      lista: (url) => {
        const tag = url.searchParams.get("tag");
        const carpeta = url.searchParams.get("carpeta");
        if (tag === "urgente" && carpeta === "proyectos") {
          return jsonResponse({ objetos: [], siguienteCursor: null });
        }
        if (tag === "urgente") {
          return jsonResponse({
            objetos: [
              nota("A", "Diario de campo", "2026-10-05T18:30:00.000Z", "diario", {
                atributos: { etiquetas: ["urgente", "casa"] },
              }),
            ],
            siguienteCursor: null,
          });
        }
        return jsonResponse({
          objetos: [
            nota("A", "Diario de campo", "2026-10-05T18:30:00.000Z", "diario", {
              atributos: { etiquetas: ["urgente", "casa"] },
            }),
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

    await user.type(screen.getByLabelText("Etiqueta"), "urgente");
    await user.click(screen.getByRole("button", { name: "Filtrar" }));

    await waitFor(() => expect(ultimaLista()?.searchParams.get("tag")).toBe("urgente"));
    await waitFor(() =>
      expect(within(main).queryByRole("heading", { name: "Plan anual" })).toBeNull(),
    );

    await user.click(screen.getByRole("button", { name: "proyectos" }));

    await waitFor(() => {
      const url = ultimaLista();
      expect(url?.searchParams.get("tag")).toBe("urgente");
      expect(url?.searchParams.get("carpeta")).toBe("proyectos");
    });
    expect(await within(main).findByText("No hay notas con esta etiqueta.")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Nuevo objeto" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Nueva nota" })).toBeEnabled();
  });

  it("crea una nota desde el diálogo con el tipo preseleccionado y navega a la ficha", async () => {
    mockApi({
      detalle: (id) => jsonResponse(nota(id, "Mi nota", "2026-10-07T09:00:00.000Z", "")),
      crear: (body) =>
        jsonResponse(nota("NUEVA", body.titulo, "2026-10-07T09:00:00.000Z", ""), 201),
    });
    const user = userEvent.setup();
    const { router } = renderNotas();

    await screen.findByText(/Todavía no hay notas/);
    await user.click(screen.getByRole("button", { name: "Nueva nota" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(dialogo().getByRole("combobox", { name: "Tipo" })).toHaveValue("nota");
    await rellenar(user, "Título", "Mi nota");
    await user.click(dialogo().getByRole("button", { name: "Crear objeto" }));

    await waitFor(() => {
      const post = posteos()[0];
      expect(post?.[0]).toBe("/api/objetos");
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({ tipo: "nota", titulo: "Mi nota" });
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/objetos/NUEVA"));
    expect(await screen.findByRole("heading", { level: 1, name: "Mi nota" })).toBeInTheDocument();
  });

  it("crea la nota dentro de la carpeta filtrada", async () => {
    mockApi({
      lista: () =>
        jsonResponse({
          objetos: [nota("B", "Plan anual", "2026-10-03T09:00:00.000Z", "proyectos")],
          siguienteCursor: null,
        }),
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

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(dialogo().getByLabelText("Carpeta (opcional)")).toHaveValue("proyectos");
    await rellenar(user, "Título", "Nota de proyecto");
    await user.click(dialogo().getByRole("button", { name: "Crear objeto" }));

    await waitFor(() => {
      expect(JSON.parse(String(posteos()[0]?.[1]?.body))).toEqual({
        tipo: "nota",
        titulo: "Nota de proyecto",
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

  it("cambia los campos al elegir otro tipo", async () => {
    mockApi({ tipos: [tipoNota, tipoLibro] });
    const user = userEvent.setup();
    renderNotas();

    await screen.findByText(/Todavía no hay notas/);
    await user.click(screen.getByRole("button", { name: "Nuevo objeto" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(dialogo().getByLabelText("Tipo")).toHaveValue("");
    expect(dialogo().queryByLabelText(/^Autor/)).toBeNull();

    await user.selectOptions(dialogo().getByLabelText("Tipo"), "libro");

    expect(dialogo().getByLabelText(/^Autor/)).toBeInTheDocument();
    expect(dialogo().getByLabelText("Género")).toBeInTheDocument();
    expect(dialogo().getByLabelText("Etiquetas")).toBeInTheDocument();
    expect(dialogo().getByRole("switch")).toBeInTheDocument();

    await user.selectOptions(dialogo().getByLabelText("Tipo"), "nota");

    expect(dialogo().queryByLabelText(/^Autor/)).toBeNull();
    expect(dialogo().queryByLabelText("Género")).toBeNull();
  });

  it("en el alta genérica de tarea oculta hecha y completada y fija pendiente", async () => {
    mockApi({ tipos: [tipoNota, tipoTarea] });
    const user = userEvent.setup();
    renderNotas();

    await screen.findByText(/Todavía no hay notas/);
    await user.click(screen.getByRole("button", { name: "Nuevo objeto" }));
    await screen.findByRole("dialog");

    await user.selectOptions(dialogo().getByLabelText("Tipo"), "tarea");

    const estado = dialogo().getByLabelText(/^Estado/);
    expect(estado).toHaveValue("pendiente");
    expect(within(estado).queryByRole("option", { name: "hecha" })).toBeNull();
    expect(within(estado).getByRole("option", { name: "en curso" })).toBeInTheDocument();
    expect(dialogo().queryByLabelText(/^Completada/)).toBeNull();

    await rellenar(user, "Título", "Preparar informe");
    await user.click(dialogo().getByRole("button", { name: "Crear objeto" }));

    await waitFor(() => {
      const post = posteos()[0];
      expect(post?.[0]).toBe("/api/objetos");
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        tipo: "tarea",
        titulo: "Preparar informe",
        atributos: { estado: "pendiente" },
      });
    });
  });

  it("en el alta genérica de recordatorio no ofrece estado y lo fija pendiente", async () => {
    mockApi({ tipos: [tipoNota, tipoRecordatorio] });
    const user = userEvent.setup();
    renderNotas();

    await screen.findByText(/Todavía no hay notas/);
    await user.click(screen.getByRole("button", { name: "Nuevo objeto" }));
    await screen.findByRole("dialog");

    await user.selectOptions(dialogo().getByLabelText("Tipo"), "recordatorio");

    expect(dialogo().queryByLabelText(/^Estado/)).toBeNull();

    await rellenar(user, "Título", "Sacar la basura");
    await user.type(dialogo().getByLabelText(/^Hora/), "2026-10-20T14:30");
    await user.click(dialogo().getByRole("button", { name: "Crear objeto" }));

    await waitFor(() => {
      const post = posteos()[0];
      expect(post?.[0]).toBe("/api/objetos");
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        tipo: "recordatorio",
        titulo: "Sacar la basura",
        atributos: { hora: new Date("2026-10-20T14:30").toISOString(), estado: "pendiente" },
      });
    });
  });

  it("crea un objeto de un tipo personalizado con sus atributos", async () => {
    mockApi({
      tipos: [tipoNota, tipoLibro],
      detalle: (id) =>
        jsonResponse(nota(id, "El Quijote", "2026-10-07T09:00:00.000Z", "", { tipo: "libro" })),
      crear: (body) =>
        jsonResponse(
          nota("LIBRO", body.titulo, "2026-10-07T09:00:00.000Z", "", {
            tipo: body.tipo ?? "nota",
            atributos: body.atributos ?? {},
          }),
          201,
        ),
    });
    const user = userEvent.setup();
    const { router } = renderNotas();

    await screen.findByText(/Todavía no hay notas/);
    await user.click(screen.getByRole("button", { name: "Nuevo objeto" }));
    await screen.findByRole("dialog");

    await user.selectOptions(dialogo().getByLabelText("Tipo"), "libro");
    await rellenar(user, "Título", "El Quijote");
    await rellenar(user, /^Autor/, "Cervantes");
    await user.selectOptions(dialogo().getByLabelText("Género"), "novela");
    await user.click(dialogo().getByRole("button", { name: "clásico" }));
    await user.click(dialogo().getByRole("switch"));
    await user.click(dialogo().getByRole("button", { name: "Crear objeto" }));

    await waitFor(() => {
      const post = posteos()[0];
      expect(post?.[0]).toBe("/api/objetos");
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        tipo: "libro",
        titulo: "El Quijote",
        atributos: { autor: "Cervantes", genero: "novela", etiquetas: ["clásico"], leido: true },
      });
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/objetos/LIBRO"));
  });

  it("no envía el alta si falta un obligatorio y avisa en local", async () => {
    mockApi({ tipos: [tipoNota, tipoLibro] });
    const user = userEvent.setup();
    renderNotas();

    await screen.findByText(/Todavía no hay notas/);
    await user.click(screen.getByRole("button", { name: "Nuevo objeto" }));
    await screen.findByRole("dialog");

    await user.selectOptions(dialogo().getByLabelText("Tipo"), "libro");
    await rellenar(user, "Título", "Sin autor");
    await user.click(dialogo().getByRole("button", { name: "Crear objeto" }));

    expect(await dialogo().findByRole("alert")).toHaveTextContent(
      "Completa los campos obligatorios",
    );
    expect(posteos()).toHaveLength(0);
  });

  it("muestra los errores del API al crear", async () => {
    mockApi({
      tipos: [tipoNota, tipoLibro],
      crear: () =>
        errorResponse("missing_required_attribute", "Falta el atributo obligatorio: autor", 422),
    });
    const user = userEvent.setup();
    renderNotas();

    await screen.findByText(/Todavía no hay notas/);
    await user.click(screen.getByRole("button", { name: "Nuevo objeto" }));
    await screen.findByRole("dialog");

    await user.selectOptions(dialogo().getByLabelText("Tipo"), "libro");
    await rellenar(user, "Título", "El Quijote");
    await rellenar(user, /^Autor/, "Cervantes");
    await user.click(dialogo().getByRole("button", { name: "Crear objeto" }));

    expect(await dialogo().findByRole("alert")).toHaveTextContent(
      "Falta el atributo obligatorio: autor",
    );
  });
});
