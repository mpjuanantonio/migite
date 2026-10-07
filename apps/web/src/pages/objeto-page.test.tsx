import type { ObjectPayload, TipoPayload } from "@migite/contracts";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
  errorResponse,
  jsonResponse,
  noContentResponse,
  renderApp,
  sesionResponse,
} from "@/test/render-app";

vi.mock("@uiw/react-codemirror", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@uiw/react-codemirror")>();
  return {
    ...actual,
    default: (props: {
      readonly value?: string;
      readonly onChange?: (value: string) => void;
      readonly "aria-label"?: string;
      readonly placeholder?: string;
    }) => (
      <textarea
        aria-label={props["aria-label"]}
        placeholder={props.placeholder}
        value={props.value ?? ""}
        onChange={(event) => props.onChange?.(event.target.value)}
      />
    ),
  };
});

let fetchMock: Mock<typeof fetch>;

type PatchBody = {
  readonly cuerpo?: string;
  readonly atributos?: Readonly<Record<string, unknown>>;
};

type PatchHandler = (body: PatchBody, attempt: number) => Response;

type RenameHandler = (nuevoTitulo: string, attempt: number) => Response;

type ObjetoApiOptions = {
  readonly objeto?: ObjectPayload;
  readonly getError?: Response;
  readonly patch?: PatchHandler;
  readonly rename?: RenameHandler;
  readonly deleteResponse?: Response;
};

const TIPOS: readonly TipoPayload[] = [
  { id: "nota", nombre: "Nota", atributos: [] },
  {
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
      { id: "prioridad", nombre: "Prioridad", tipo: "numero", obligatorio: false },
      { id: "urgente", nombre: "Urgente", tipo: "booleano", obligatorio: false },
      {
        id: "etiquetas",
        nombre: "Etiquetas",
        tipo: "multi-seleccion",
        obligatorio: false,
        opciones: ["trabajo", "casa"],
      },
      { id: "web", nombre: "Web", tipo: "url", obligatorio: false },
      { id: "enlace", nombre: "Enlace", tipo: "referencia", obligatorio: false },
      { id: "adjunto", nombre: "Adjunto", tipo: "archivo", obligatorio: false },
      { id: "notas", nombre: "Notas", tipo: "texto", obligatorio: false },
    ],
  },
];

const objetoDePrueba = (overrides: Partial<ObjectPayload> = {}): ObjectPayload => ({
  id: "01JALFA",
  tipo: "nota",
  titulo: "Cuaderno de campo",
  ruta: "notas/cuaderno.md",
  carpeta: "notas",
  creado: "2026-10-01T10:00:00.000Z",
  actualizado: "2026-10-05T18:30:00.000Z",
  atributos: {},
  cuerpo: "# Diario\n\nUna **nota** serena.",
  enlaces: [],
  degraded: [],
  ...overrides,
});

const mockObjetoApi = (options: ObjetoApiOptions = {}): void => {
  let intentos = 0;
  let intentosRenombrado = 0;
  const objeto = options.objeto ?? objetoDePrueba();

  fetchMock.mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("/api/tipos")) {
      return jsonResponse({ tipos: TIPOS });
    }
    if (url === "/api/objetos") {
      return jsonResponse({ objetos: [], siguienteCursor: null });
    }
    if (!url.startsWith("/api/objetos/")) {
      return sesionResponse(true);
    }
    const method = init?.method ?? "GET";
    if (method === "PATCH") {
      intentos += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as PatchBody;
      if (options.patch !== undefined) {
        return options.patch(body, intentos);
      }
      return jsonResponse({
        ...objeto,
        ...(body.cuerpo === undefined ? {} : { cuerpo: body.cuerpo }),
        ...(body.atributos === undefined
          ? {}
          : { atributos: { ...objeto.atributos, ...body.atributos } }),
      });
    }
    if (method === "POST" && url.endsWith("/renombrar")) {
      intentosRenombrado += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as { readonly nuevoTitulo?: string };
      const nuevoTitulo = body.nuevoTitulo ?? objeto.titulo;
      if (options.rename !== undefined) {
        return options.rename(nuevoTitulo, intentosRenombrado);
      }
      return jsonResponse({
        objeto: { ...objeto, titulo: nuevoTitulo },
        informe: { reescritos: [], omitidos: [], enlacesSinResolver: [] },
      });
    }
    if (method === "DELETE") {
      return options.deleteResponse ?? noContentResponse();
    }
    if (options.getError !== undefined) {
      return options.getError;
    }
    return jsonResponse(objeto);
  });
};

const objetoTarea = (overrides: Partial<ObjectPayload> = {}): ObjectPayload =>
  objetoDePrueba({
    tipo: "tarea",
    titulo: "Preparar mudanza",
    atributos: { estado: "pendiente" },
    ...overrides,
  });

const renderObjeto = () =>
  renderApp("/objetos/01JALFA", new QueryClient({ defaultOptions: { queries: { retry: false } } }));

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ficha de objeto", () => {
  it("carga el objeto y muestra el cuerpo en el editor y en la vista previa", async () => {
    mockObjetoApi();
    renderObjeto();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Cuaderno de campo" }),
    ).toBeInTheDocument();
    expect(screen.getByText("nota", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Sin cambios")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();

    const editor = screen.getByLabelText("Cuerpo de la ficha en markdown");
    expect(editor).toHaveValue("# Diario\n\nUna **nota** serena.");

    const preview = screen.getByRole("region", { name: "Vista previa" });
    expect(within(preview).getByRole("heading", { level: 1, name: "Diario" })).toBeInTheDocument();
    expect(within(preview).getByText("nota", { selector: "strong" })).toBeInTheDocument();
  });

  it("muestra el mensaje del API cuando la ficha no existe", async () => {
    mockObjetoApi({
      getError: errorResponse("not_found", "No existe la ficha solicitada", 404),
    });
    renderObjeto();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Ficha no encontrada" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No existe la ficha solicitada")).toBeInTheDocument();
  });

  it("avisa cuando el objeto está en modo degradado", async () => {
    mockObjetoApi({
      objeto: objetoDePrueba({
        degraded: [{ kind: "unknownType", type: "misterio" }],
      }),
    });
    renderObjeto();

    expect(await screen.findByText("Objeto en modo degradado")).toBeInTheDocument();
    expect(screen.getByLabelText("Cuerpo de la ficha en markdown")).toBeInTheDocument();
  });

  it("edita y guarda el cuerpo con el botón", async () => {
    mockObjetoApi();
    const user = userEvent.setup();
    renderObjeto();

    const editor = await screen.findByLabelText("Cuerpo de la ficha en markdown");
    await user.clear(editor);
    await user.type(editor, "Cuerpo nuevo");

    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
    const preview = screen.getByRole("region", { name: "Vista previa" });
    expect(within(preview).getByText("Cuerpo nuevo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Guardado")).toBeInTheDocument();
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall?.[0]).toBe("/api/objetos/01JALFA");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({ cuerpo: "Cuerpo nuevo" });
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("muestra el error de guardado y permite reintentar", async () => {
    mockObjetoApi({
      patch: (_body, attempt) =>
        attempt === 1
          ? errorResponse("write_error", "No se pudo escribir el archivo", 500)
          : jsonResponse(objetoDePrueba({ cuerpo: "Cuerpo recuperado" })),
    });
    const user = userEvent.setup();
    renderObjeto();

    const editor = await screen.findByLabelText("Cuerpo de la ficha en markdown");
    await user.clear(editor);
    await user.type(editor, "Cuerpo recuperado");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("No se pudo escribir el archivo");

    await user.click(within(alerta).getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Guardado")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("guarda con el atajo Ctrl+S", async () => {
    mockObjetoApi();
    const user = userEvent.setup();
    renderObjeto();

    const editor = await screen.findByLabelText("Cuerpo de la ficha en markdown");
    await user.clear(editor);
    await user.type(editor, "Cuerpo con atajo");
    await user.keyboard("{Control>}s{/Control}");

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(patchCall).toBeDefined();
      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({ cuerpo: "Cuerpo con atajo" });
    });
    expect(await screen.findByText("Guardado")).toBeInTheDocument();
  });
});

const patchAtributos = (): PatchBody | undefined => {
  for (const [, init] of fetchMock.mock.calls) {
    if (init?.method !== "PATCH") {
      continue;
    }
    const body = JSON.parse(String(init.body ?? "{}")) as PatchBody;
    if (body.atributos !== undefined) {
      return body;
    }
  }
  return undefined;
};

describe("bandeja de atributos", () => {
  it("muestra los atributos definidos con el widget de cada tipo", async () => {
    mockObjetoApi({
      objeto: objetoTarea({
        atributos: {
          estado: "pendiente",
          vencimiento: "2026-10-10",
          completada: "2026-10-05T12:30:00.000Z",
          prioridad: 3,
          urgente: true,
          etiquetas: ["casa"],
          web: "https://ejemplo.dev",
          enlace: "[[Beta]]",
          adjunto: "docs/a.pdf",
        },
      }),
    });
    renderObjeto();

    expect(await screen.findByLabelText("Estado")).toHaveValue("pendiente");

    const vencimiento = screen.getByLabelText("Vencimiento");
    expect(vencimiento).toHaveAttribute("type", "date");
    expect(vencimiento).toHaveValue("2026-10-10");

    const completada = screen.getByLabelText("Completada");
    expect(completada).toHaveAttribute("type", "datetime-local");
    expect(completada).not.toHaveValue("");

    expect(screen.getByLabelText("Prioridad")).toHaveAttribute("type", "number");
    expect(screen.getByLabelText("Prioridad")).toHaveValue(3);
    expect(screen.getByRole("switch", { name: "Urgente" })).toBeChecked();
    expect(screen.getByRole("button", { name: "casa" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "trabajo" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByLabelText("Web")).toHaveAttribute("type", "url");
    expect(screen.getByLabelText("Enlace")).toHaveValue("[[Beta]]");
    expect(screen.getByLabelText("Adjunto")).toHaveValue("docs/a.pdf");
    expect(screen.getByRole("button", { name: "Guardar atributos" })).toBeDisabled();
  });

  it("edita y guarda los atributos con el mapa fusionado", async () => {
    mockObjetoApi({
      objeto: objetoTarea({
        atributos: { estado: "pendiente", vencimiento: "2026-10-10", prioridad: 3, urgente: false },
      }),
    });
    const user = userEvent.setup();
    renderObjeto();

    fireEvent.change(await screen.findByLabelText("Vencimiento"), {
      target: { value: "2026-11-01" },
    });
    await user.selectOptions(screen.getByLabelText("Estado"), "hecha");
    await user.click(screen.getByRole("switch", { name: "Urgente" }));

    expect(screen.getByText("Atributos sin guardar")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Guardar atributos" }));

    expect(await screen.findByText("Atributos guardados")).toBeInTheDocument();
    expect(patchAtributos()?.atributos).toEqual({
      estado: "hecha",
      vencimiento: "2026-11-01",
      prioridad: 3,
      urgente: true,
    });
    expect(screen.getByRole("button", { name: "Guardar atributos" })).toBeDisabled();
  });

  it("añade un atributo libre y lo guarda", async () => {
    mockObjetoApi();
    const user = userEvent.setup();
    renderObjeto();

    await user.type(await screen.findByLabelText("Clave"), "proyecto");
    await user.type(screen.getByLabelText("Valor"), "migite");
    await user.click(screen.getByRole("button", { name: "Añadir atributo" }));

    expect(await screen.findByLabelText("proyecto")).toHaveValue("migite");
    await user.click(screen.getByRole("button", { name: "Guardar atributos" }));

    expect(await screen.findByText("Atributos guardados")).toBeInTheDocument();
    expect(patchAtributos()?.atributos).toEqual({ proyecto: "migite" });
  });

  it("elimina atributos libres y definidos opcionales", async () => {
    mockObjetoApi({
      objeto: objetoTarea({
        atributos: { estado: "pendiente", vencimiento: "2026-10-10", presupuesto: 1200 },
      }),
    });
    const user = userEvent.setup();
    renderObjeto();

    await screen.findByLabelText("Estado");
    expect(screen.queryByRole("button", { name: "Eliminar atributo estado" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Eliminar atributo vencimiento" }));
    await user.click(screen.getByRole("button", { name: "Eliminar atributo presupuesto" }));

    expect(screen.queryByLabelText("Vencimiento")).toBeNull();
    expect(screen.queryByLabelText("presupuesto")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Guardar atributos" }));

    expect(await screen.findByText("Atributos guardados")).toBeInTheDocument();
    expect(patchAtributos()?.atributos).toEqual({
      estado: "pendiente",
      vencimiento: null,
      presupuesto: null,
    });
  });

  it("muestra los valores en crudo y los guarda en modo degradado", async () => {
    mockObjetoApi({
      objeto: objetoDePrueba({
        tipo: "misterio",
        atributos: { presupuesto: 1200, nota: "hola" },
        degraded: [{ kind: "unknownType", type: "misterio" }],
      }),
    });
    const user = userEvent.setup();
    renderObjeto();

    expect(await screen.findByText("Valores en crudo")).toBeInTheDocument();
    const presupuesto = screen.getByLabelText("presupuesto");
    expect(presupuesto).toHaveAttribute("type", "text");
    expect(presupuesto).toHaveValue("1200");
    expect(screen.getByLabelText("nota")).toHaveValue("hola");

    fireEvent.change(presupuesto, { target: { value: "1500" } });
    await user.click(screen.getByRole("button", { name: "Guardar atributos" }));

    expect(await screen.findByText("Atributos guardados")).toBeInTheDocument();
    expect(patchAtributos()?.atributos).toEqual({ presupuesto: 1500, nota: "hola" });
  });

  it("conserva lo tipeado cuando el PATCH de atributos falla", async () => {
    mockObjetoApi({
      objeto: objetoTarea({ atributos: { estado: "pendiente", web: "https://ejemplo.dev" } }),
      patch: (_body, attempt) =>
        attempt === 1
          ? errorResponse("invalid_object_write", 'attribute "web": expected an http(s) URL', 422)
          : jsonResponse(objetoTarea({ atributos: { estado: "pendiente", web: "no-es-url" } })),
    });
    const user = userEvent.setup();
    renderObjeto();

    const web = await screen.findByLabelText("Web");
    fireEvent.change(web, { target: { value: "no-es-url" } });
    await user.click(screen.getByRole("button", { name: "Guardar atributos" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent('attribute "web": expected an http(s) URL');
    expect(web).toHaveValue("no-es-url");

    await user.click(within(alerta).getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Atributos guardados")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

const abrirDialogoRenombrar = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("button", { name: "Renombrar" }));
  return screen.findByRole("dialog");
};

describe("renombrar y borrar la ficha", () => {
  it("renombra la ficha y muestra el informe de ficheros reescritos", async () => {
    mockObjetoApi({
      rename: (nuevoTitulo) =>
        jsonResponse({
          objeto: objetoDePrueba({ titulo: nuevoTitulo }),
          informe: {
            reescritos: ["diario/ref.md", "tareas/x.md"],
            omitidos: [],
            enlacesSinResolver: [],
          },
        }),
    });
    const user = userEvent.setup();
    renderObjeto();

    const dialogo = await abrirDialogoRenombrar(user);
    const campo = within(dialogo).getByLabelText("Nuevo título");
    expect(campo).toHaveValue("Cuaderno de campo");
    await user.clear(campo);
    await user.type(campo, "Cuaderno nuevo");
    await user.click(within(dialogo).getByRole("button", { name: "Renombrar" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Cuaderno nuevo" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    const llamada = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/renombrar"));
    expect(llamada?.[0]).toBe("/api/objetos/01JALFA/renombrar");
    expect(llamada?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(llamada?.[1]?.body))).toEqual({ nuevoTitulo: "Cuaderno nuevo" });

    expect(await screen.findByText("Ficha renombrada")).toBeInTheDocument();
    expect(screen.getByText("Ficheros reescritos (2)")).toBeInTheDocument();
    expect(screen.getByText("diario/ref.md")).toBeInTheDocument();
    expect(screen.getByText("tareas/x.md")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("avisa de los enlaces sin resolver y de los ficheros omitidos", async () => {
    mockObjetoApi({
      rename: () =>
        jsonResponse({
          objeto: objetoDePrueba({ titulo: "Cuaderno nuevo" }),
          informe: {
            reescritos: [],
            omitidos: [{ path: "roto.md", problems: ["frontmatter ilegible"] }],
            enlacesSinResolver: [{ path: "notas/otra.md", link: "[[Cuaderno de campo]]" }],
          },
        }),
    });
    const user = userEvent.setup();
    renderObjeto();

    const dialogo = await abrirDialogoRenombrar(user);
    await user.clear(within(dialogo).getByLabelText("Nuevo título"));
    await user.type(within(dialogo).getByLabelText("Nuevo título"), "Cuaderno nuevo");
    await user.click(within(dialogo).getByRole("button", { name: "Renombrar" }));

    expect(await screen.findByText("Ficheros omitidos")).toBeInTheDocument();
    expect(screen.getByText(/frontmatter ilegible/)).toBeInTheDocument();
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Enlaces sin resolver");
    expect(aviso).toHaveTextContent("«[[Cuaderno de campo]]» en notas/otra.md");
  });

  it("muestra el error del API cuando el título está duplicado", async () => {
    mockObjetoApi({
      rename: () => errorResponse("ambiguous_title", "Ya existe una ficha con ese título", 409),
    });
    const user = userEvent.setup();
    renderObjeto();

    const dialogo = await abrirDialogoRenombrar(user);
    await user.clear(within(dialogo).getByLabelText("Nuevo título"));
    await user.type(within(dialogo).getByLabelText("Nuevo título"), "Otro título");
    await user.click(within(dialogo).getByRole("button", { name: "Renombrar" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Ya existe una ficha con ese título");
    expect(within(dialogo).getByLabelText("Nuevo título")).toHaveValue("Otro título");
    expect(screen.getByText("Cuaderno de campo", { selector: "h1" })).toBeInTheDocument();
  });

  it("no llama al API si el borrado no se confirma", async () => {
    mockObjetoApi();
    const user = userEvent.setup();
    const { router } = renderObjeto();

    await user.click(await screen.findByRole("button", { name: "Borrar" }));
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("¿Borrar «Cuaderno de campo»?");
    expect(dialogo).toHaveTextContent("Esta acción no se puede deshacer.");

    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    expect(router.state.location.pathname).toBe("/objetos/01JALFA");
  });

  it("borra la ficha con confirmación y navega a notas", async () => {
    mockObjetoApi();
    const user = userEvent.setup();
    const { router } = renderObjeto();

    await user.click(await screen.findByRole("button", { name: "Borrar" }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Borrar ficha" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/notas");
    });
    const llamada = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(llamada?.[0]).toBe("/api/objetos/01JALFA?confirmar=1");
    expect(await screen.findByRole("heading", { level: 1, name: "Notas" })).toBeInTheDocument();
  });

  it("muestra el error y no navega cuando el borrado falla", async () => {
    mockObjetoApi({
      deleteResponse: errorResponse("write_error", "No se pudo borrar el archivo", 500),
    });
    const user = userEvent.setup();
    const { router } = renderObjeto();

    await user.click(await screen.findByRole("button", { name: "Borrar" }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Borrar ficha" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("No se pudo borrar el archivo");
    expect(router.state.location.pathname).toBe("/objetos/01JALFA");
  });
});
