import type { CreateObjectBody, ObjectPayload } from "@migite/contracts";
import { QueryClient } from "@tanstack/react-query";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { fechaLocal, finDelDia } from "@/lib/tareas";
import { errorResponse, jsonResponse, renderApp, sesionResponse } from "@/test/render-app";

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 10_000 });

let fetchMock: Mock<typeof fetch>;
let listados: URL[];
let parches: {
  readonly id: string;
  readonly body: { readonly atributos?: Record<string, unknown> };
}[];

type OpcionesTarea = {
  readonly estado?: string;
  readonly vencimiento?: string;
  readonly completada?: string;
};

const tarea = (id: string, titulo: string, opciones: OpcionesTarea = {}): ObjectPayload => {
  const { estado = "pendiente", vencimiento, completada } = opciones;
  const atributos: Record<string, unknown> = { estado };
  if (vencimiento !== undefined) {
    atributos.vencimiento = vencimiento;
  }
  if (completada !== undefined) {
    atributos.completada = completada;
  }
  return {
    id,
    tipo: "tarea",
    titulo,
    ruta: `tareas/${id}.md`,
    carpeta: "tareas",
    creado: "2026-10-01T10:00:00.000Z",
    actualizado: "2026-10-05T10:00:00.000Z",
    atributos,
    cuerpo: "",
    enlaces: [],
    degraded: [],
  };
};

type MockApiOptions = {
  readonly tareas?: readonly ObjectPayload[];
  readonly lista?: (url: URL, intento: number) => Response | undefined;
};

const mockApi = (options: MockApiOptions = {}): void => {
  const tareas = [...(options.tareas ?? [])];
  let intentosLista = 0;

  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";

    if (url.pathname === "/api/sesion") {
      return sesionResponse(true);
    }

    if (url.pathname === "/api/objetos" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as CreateObjectBody;
      const vencimiento = body.atributos?.vencimiento;
      const creada = tarea("CREADA", body.titulo, {
        ...(typeof vencimiento === "string" ? { vencimiento } : {}),
      });
      tareas.unshift(creada);
      return jsonResponse(creada, 201);
    }

    if (url.pathname.startsWith("/api/objetos/") && method === "PATCH") {
      const id = decodeURIComponent(url.pathname.slice("/api/objetos/".length));
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        atributos?: Record<string, unknown>;
      };
      parches.push({ id, body });
      const indice = tareas.findIndex((item) => item.id === id);
      const actual = tareas[indice];
      if (actual === undefined || body.atributos === undefined) {
        return errorResponse("not_found", "No existe la ficha", 404);
      }
      const atributos = { ...actual.atributos };
      for (const [clave, valor] of Object.entries(body.atributos)) {
        if (valor === null) {
          delete atributos[clave];
        } else {
          atributos[clave] = valor;
        }
      }
      const actualizada = { ...actual, atributos, actualizado: new Date().toISOString() };
      tareas[indice] = actualizada;
      return jsonResponse(actualizada);
    }

    if (url.pathname === "/api/objetos") {
      listados.push(url);
      intentosLista += 1;
      const respuesta = options.lista?.(url, intentosLista);
      if (respuesta !== undefined) {
        return respuesta;
      }
      return jsonResponse({ objetos: tareas, siguienteCursor: null });
    }

    return errorResponse("not_found", "No existe la ruta", 404);
  });
};

const renderTareas = () =>
  renderApp("/tareas", new QueryClient({ defaultOptions: { queries: { retry: false } } }));

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
  parches = [];
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("vista de tareas", () => {
  it("consulta hoy por defecto y cambia a pendientes y todas", async () => {
    mockApi({ tareas: [tarea("A", "Revisar correo", { vencimiento: fechaLocal(new Date()) })] });
    const user = userEvent.setup();
    renderTareas();

    await screen.findByRole("link", { name: "Revisar correo" });

    const primera = listados[0];
    expect(primera?.searchParams.get("tipo")).toBe("tarea");
    expect(primera?.searchParams.get("limite")).toBe("20");
    expect(primera?.searchParams.get("rango.vencimiento.hasta")).toBe(finDelDia(new Date()));
    expect(primera?.searchParams.get("rango.vencimiento.desde")).toBeNull();
    expect(primera?.searchParams.getAll("atributo.estado")).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Pendientes" }));
    await waitFor(() => {
      expect(listados.at(-1)?.searchParams.getAll("atributo.estado")).toEqual([
        "pendiente",
        "en curso",
      ]);
    });

    await user.click(screen.getByRole("button", { name: "Todas" }));
    await waitFor(() => {
      const ultima = listados.at(-1);
      expect(ultima?.searchParams.getAll("atributo.estado")).toEqual([]);
      expect(ultima?.searchParams.get("rango.vencimiento.hasta")).toBeNull();
      expect(ultima?.searchParams.get("tipo")).toBe("tarea");
    });
  });

  it("muestra estado y vencimiento, y marca como vencidas las que no están hechas", async () => {
    const ayer = fechaLocal(new Date(Date.now() - 86_400_000));
    mockApi({
      tareas: [
        tarea("A", "Pagar alquiler", { estado: "pendiente", vencimiento: ayer }),
        tarea("B", "Enviar informe", { estado: "hecha", vencimiento: ayer }),
        tarea("C", "Llamar cliente", { estado: "en curso" }),
      ],
    });
    renderTareas();

    await screen.findByRole("link", { name: "Pagar alquiler" });

    const vencida = filaDe("Pagar alquiler");
    expect(within(vencida).getByRole("link")).toHaveAttribute("href", "/objetos/A");
    expect(within(vencida).getByText("pendiente", { selector: "span" })).toBeInTheDocument();
    expect(within(vencida).getByText("Vencida")).toBeInTheDocument();
    expect(vencida.querySelector("time")).toHaveAttribute("datetime", ayer);

    const hecha = filaDe("Enviar informe");
    expect(within(hecha).getByText("hecha", { selector: "span" })).toBeInTheDocument();
    expect(within(hecha).queryByText("Vencida")).toBeNull();

    const sinFecha = filaDe("Llamar cliente");
    expect(within(sinFecha).getByText("en curso", { selector: "span" })).toBeInTheDocument();
    expect(within(sinFecha).getByText("Sin fecha")).toBeInTheDocument();
  });

  it("guarda la fecha de finalización al marcar hecha y la limpia al deshacer", async () => {
    const antes = Date.now();
    mockApi({ tareas: [tarea("A", "Regar plantas")] });
    const user = userEvent.setup();
    renderTareas();

    await screen.findByRole("link", { name: "Regar plantas" });
    const etiqueta = { name: "Estado de Regar plantas" };
    expect(screen.getByRole("combobox", etiqueta)).toHaveValue("pendiente");

    await user.selectOptions(screen.getByRole("combobox", etiqueta), "hecha");

    await waitFor(() => expect(parches).toHaveLength(1));
    const primero = parches[0];
    expect(primero?.id).toBe("A");
    expect(primero?.body).toEqual({
      atributos: { estado: "hecha", completada: expect.any(String) },
    });
    const completada = primero?.body.atributos?.completada;
    expect(typeof completada).toBe("string");
    expect(completada).toMatch(/Z$/);
    expect(new Date(String(completada)).getTime()).toBeGreaterThanOrEqual(antes);

    await waitFor(() => expect(screen.getByRole("combobox", etiqueta)).toHaveValue("hecha"));

    await user.selectOptions(screen.getByRole("combobox", etiqueta), "pendiente");

    await waitFor(() => expect(parches).toHaveLength(2));
    expect(parches[1]?.body).toEqual({
      atributos: { estado: "pendiente", completada: null },
    });
    await waitFor(() => expect(screen.getByRole("combobox", etiqueta)).toHaveValue("pendiente"));
  });

  it("crea una tarea con título y fecha límite opcional", async () => {
    mockApi();
    const user = userEvent.setup();
    renderTareas();

    await screen.findByText("No hay tareas para hoy.");
    await user.click(screen.getByRole("button", { name: "Nueva tarea" }));
    await user.type(await screen.findByLabelText("Título"), "Preparar informe");
    await user.type(screen.getByLabelText("Fecha límite"), "2026-10-20");
    await user.click(screen.getByRole("button", { name: "Crear tarea" }));

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
      expect(posts).toHaveLength(1);
      expect(posts[0]?.[0]).toBe("/api/objetos");
      expect(JSON.parse(String(posts[0]?.[1]?.body))).toEqual({
        tipo: "tarea",
        titulo: "Preparar informe",
        atributos: { estado: "pendiente", vencimiento: "2026-10-20" },
      });
    });
    await waitFor(() => expect(screen.queryByLabelText("Título")).toBeNull());
    expect(await screen.findByRole("link", { name: "Preparar informe" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Nueva tarea" }));
    await user.type(await screen.findByLabelText("Título"), "Otra tarea");
    await user.click(screen.getByRole("button", { name: "Crear tarea" }));

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
      expect(posts).toHaveLength(2);
      expect(JSON.parse(String(posts[1]?.[1]?.body))).toEqual({
        tipo: "tarea",
        titulo: "Otra tarea",
        atributos: { estado: "pendiente" },
      });
    });
  });

  it("pagina con Cargar más sin duplicar filas", async () => {
    mockApi({
      lista: (url) => {
        if (url.searchParams.get("cursor") === "cursor-1") {
          return jsonResponse({
            objetos: [tarea("C", "Tercera")],
            siguienteCursor: null,
          });
        }
        return jsonResponse({
          objetos: [tarea("A", "Primera"), tarea("B", "Segunda")],
          siguienteCursor: "cursor-1",
        });
      },
    });
    const user = userEvent.setup();
    renderTareas();

    await screen.findByRole("link", { name: "Primera" });
    await user.click(screen.getByRole("button", { name: "Cargar más" }));

    await screen.findByRole("link", { name: "Tercera" });
    expect(listados.at(-1)?.searchParams.get("cursor")).toBe("cursor-1");
    const main = screen.getByRole("main");
    expect(within(main).getAllByRole("listitem")).toHaveLength(3);
    expect(within(main).getAllByRole("link", { name: "Segunda" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();
  });
});
