import type { ObjectPayload } from "@migite/contracts";
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { errorResponse, jsonResponse, renderApp, sesionResponse } from "@/test/render-app";

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

type PatchHandler = (body: { readonly cuerpo?: string }, attempt: number) => Response;

type ObjetoApiOptions = {
  readonly objeto?: ObjectPayload;
  readonly getError?: Response;
  readonly patch?: PatchHandler;
};

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
  const objeto = options.objeto ?? objetoDePrueba();

  fetchMock.mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("/api/objetos/")) {
      return sesionResponse(true);
    }
    const method = init?.method ?? "GET";
    if (method === "PATCH") {
      intentos += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as { readonly cuerpo?: string };
      if (options.patch !== undefined) {
        return options.patch(body, intentos);
      }
      return jsonResponse({ ...objeto, cuerpo: body.cuerpo ?? "" });
    }
    if (options.getError !== undefined) {
      return options.getError;
    }
    return jsonResponse(objeto);
  });
};

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
