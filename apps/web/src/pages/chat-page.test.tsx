import type { Accion, ChatHistorialMensaje, ChatStreamEvent } from "@migite/contracts";
import { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
  errorResponse,
  jsonResponse,
  noContentResponse,
  renderApp,
  sesionResponse,
} from "@/test/render-app";

type SseControl = {
  readonly response: Response;
  readonly enqueue: (evento: ChatStreamEvent) => void;
  readonly close: () => void;
};

const crearSse = (): SseControl => {
  const encoder = new TextEncoder();
  let controlador: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controlador = controller;
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    enqueue: (evento) => {
      controlador?.enqueue(encoder.encode(`data: ${JSON.stringify(evento)}\n\n`));
    },
    close: () => {
      controlador?.close();
    },
  };
};

const sseCerrado = (eventos: readonly ChatStreamEvent[]): Response => {
  const encoder = new TextEncoder();
  const cuerpo = eventos.map((evento) => `data: ${JSON.stringify(evento)}\n\n`).join("");
  return new Response(encoder.encode(cuerpo), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
};

const emitir = async (sse: SseControl, evento: ChatStreamEvent): Promise<void> => {
  await act(async () => {
    sse.enqueue(evento);
    await new Promise((resolver) => setTimeout(resolver, 0));
  });
};

const cerrar = async (sse: SseControl): Promise<void> => {
  await act(async () => {
    sse.close();
    await new Promise((resolver) => setTimeout(resolver, 0));
  });
};

const accionCrear = (id = "A1", titulo = "Comprar pan"): Accion => ({
  id,
  tipoAccion: "crear_objeto",
  payload: { tipo: "tarea", titulo },
  estado: "pendiente",
  creada: "2026-10-10T10:00:00.000Z",
});

const CAMPOS_VACIOS: ChatStreamEvent = {
  tipo: "fin",
  contenido: "",
  pasos: 0,
  estado: "completado",
  accionesPropuestas: [],
};

type MockApiOptions = {
  readonly pendientes?: readonly Accion[];
  readonly chat?: () => Response;
  readonly confirmar?: (id: string) => Response;
  readonly rechazar?: (id: string) => Response;
};

let fetchMock: Mock<typeof fetch>;
let cuerposChat: { mensaje: string; historial?: ChatHistorialMensaje[] }[];

const mockApi = (options: MockApiOptions = {}): void => {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";

    if (url.pathname === "/api/sesion") {
      return sesionResponse(true);
    }
    if (url.pathname === "/api/tipos") {
      return jsonResponse({ tipos: [] });
    }
    if (url.pathname === "/api/acciones" && method === "GET") {
      return jsonResponse({ acciones: options.pendientes ?? [] });
    }
    if (url.pathname.startsWith("/api/acciones/") && url.pathname.endsWith("/confirmar")) {
      const id = decodeURIComponent(url.pathname.split("/")[3] ?? "");
      if (options.confirmar !== undefined) {
        return options.confirmar(id);
      }
      const original = (options.pendientes ?? []).find((accion) => accion.id === id);
      return jsonResponse({
        ...(original ?? accionCrear()),
        estado: "aplicada",
        resultado: { id: "creado" },
      });
    }
    if (url.pathname.startsWith("/api/acciones/") && url.pathname.endsWith("/rechazar")) {
      const id = decodeURIComponent(url.pathname.split("/")[3] ?? "");
      return options.rechazar?.(id) ?? noContentResponse();
    }
    if (url.pathname === "/api/chat/mensajes" && method === "POST") {
      cuerposChat.push(
        JSON.parse(String(init?.body ?? "{}")) as {
          mensaje: string;
          historial?: ChatHistorialMensaje[];
        },
      );
      return options.chat?.() ?? sseCerrado([CAMPOS_VACIOS]);
    }

    return errorResponse("not_found", "No existe la ruta", 404);
  });
};

const renderChat = (client?: QueryClient) =>
  renderApp("/chat", client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } }));

const cajaDeTexto = async (): Promise<HTMLElement> =>
  screen.findByRole("textbox", { name: "Mensaje para el agente" });

beforeEach(() => {
  localStorage.clear();
  cuerposChat = [];
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("página del chat", () => {
  it("renderiza la conversación con el texto apareciendo en streaming", async () => {
    const sse = crearSse();
    mockApi({ chat: () => sse.response });
    const user = userEvent.setup();
    renderChat();

    expect(await screen.findByText("Escribe un mensaje para empezar.")).toBeInTheDocument();

    const caja = await cajaDeTexto();
    await user.type(caja, "¿Cuántas notas hay?");
    await user.keyboard("{Enter}");

    expect(await screen.findByText("¿Cuántas notas hay?")).toBeInTheDocument();
    expect(caja).toBeDisabled();

    await emitir(sse, { tipo: "delta", texto: "Tienes " });
    expect(screen.getByText("Tienes")).toBeInTheDocument();

    await emitir(sse, { tipo: "delta", texto: "12 notas." });
    expect(screen.getByText("Tienes 12 notas.")).toBeInTheDocument();

    await emitir(sse, {
      tipo: "fin",
      contenido: "Tienes 12 notas.",
      pasos: 2,
      estado: "completado",
      accionesPropuestas: [],
    });
    await cerrar(sse);

    await waitFor(() => expect(caja).toBeEnabled());
    expect(screen.getByText("Tienes 12 notas.")).toBeInTheDocument();
  });

  it("muestra un indicador discreto mientras se ejecuta una herramienta", async () => {
    const sse = crearSse();
    mockApi({ chat: () => sse.response });
    const user = userEvent.setup();
    renderChat();

    await user.type(await cajaDeTexto(), "Busca la nota");
    await user.keyboard("{Enter}");

    await emitir(sse, { tipo: "herramienta", nombre: "listar_objetos", isError: false });
    expect(screen.getByRole("status")).toHaveTextContent("usando listar_objetos…");

    await emitir(sse, { tipo: "delta", texto: "Encontrada" });
    expect(screen.queryByText("usando listar_objetos…")).toBeNull();

    await emitir(sse, { tipo: "herramienta", nombre: "buscar", isError: true });
    expect(screen.getByRole("status")).toHaveTextContent("error en buscar");

    await emitir(sse, {
      tipo: "fin",
      contenido: "Encontrada",
      pasos: 2,
      estado: "limite",
      accionesPropuestas: [],
    });
    await cerrar(sse);

    expect(screen.getByText("El agente alcanzó el límite de pasos.")).toBeInTheDocument();
  });

  it("lista las propuestas pendientes, confirma una acción e invalida las colecciones", async () => {
    mockApi({ pendientes: [accionCrear("A1", "Comprar pan")] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidar = vi.spyOn(client, "invalidateQueries");
    const user = userEvent.setup();
    renderChat(client);

    expect(await screen.findByRole("heading", { name: "Crear «Comprar pan»" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(screen.getByText("Aplicada")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = new URL(String(input), "http://localhost");
        return url.pathname === "/api/acciones/A1/confirmar" && init?.method === "POST";
      }),
    ).toBe(true);
    expect(invalidar).toHaveBeenCalledWith(
      expect.objectContaining({ predicate: expect.any(Function) }),
    );
  });

  it("rechaza una propuesta y deja la tarjeta en estado rechazada", async () => {
    mockApi({ pendientes: [accionCrear("A1", "Comprar pan")] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidar = vi.spyOn(client, "invalidateQueries");
    const user = userEvent.setup();
    renderChat(client);

    await screen.findByRole("heading", { name: "Crear «Comprar pan»" });
    await user.click(screen.getByRole("button", { name: "Rechazar" }));

    await waitFor(() => expect(screen.getByText("Rechazada")).toBeInTheDocument());
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = new URL(String(input), "http://localhost");
        return url.pathname === "/api/acciones/A1/rechazar" && init?.method === "POST";
      }),
    ).toBe(true);
    expect(invalidar).toHaveBeenCalledWith(
      expect.objectContaining({ predicate: expect.any(Function) }),
    );
  });

  it("muestra un mensaje claro si la acción ya no está pendiente", async () => {
    mockApi({
      pendientes: [accionCrear("A1", "Comprar pan")],
      confirmar: () =>
        errorResponse("action_conflict", "La acción propuesta ya no está pendiente", 409),
    });
    const user = userEvent.setup();
    renderChat();

    await screen.findByRole("heading", { name: "Crear «Comprar pan»" });
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La acción propuesta ya no está pendiente",
    );
  });

  it("muestra el error del stream y permite reintentar", async () => {
    const segundo = crearSse();
    let intentos = 0;
    mockApi({
      chat: () => {
        intentos += 1;
        return intentos === 1
          ? sseCerrado([{ tipo: "error", mensaje: "El agente falló" }])
          : segundo.response;
      },
    });
    const user = userEvent.setup();
    renderChat();

    await user.type(await cajaDeTexto(), "Hola");
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("El agente falló");
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    await emitir(segundo, { tipo: "delta", texto: "Hola de nuevo" });
    expect(screen.getByText("Hola de nuevo")).toBeInTheDocument();

    await emitir(segundo, {
      tipo: "fin",
      contenido: "Hola de nuevo",
      pasos: 1,
      estado: "completado",
      accionesPropuestas: [],
    });
    await cerrar(segundo);
  });

  it("envía el historial de la conversación visible con el nuevo mensaje", async () => {
    const primera = crearSse();
    const segunda = crearSse();
    const respuestas = [primera, segunda];
    mockApi({ chat: () => respuestas.shift()?.response ?? sseCerrado([CAMPOS_VACIOS]) });
    const user = userEvent.setup();
    renderChat();

    await user.type(await cajaDeTexto(), "Hola");
    await user.keyboard("{Enter}");
    await emitir(primera, { tipo: "delta", texto: "Hola mundo" });
    await emitir(primera, {
      tipo: "fin",
      contenido: "Hola mundo",
      pasos: 1,
      estado: "completado",
      accionesPropuestas: [],
    });
    await cerrar(primera);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());

    await user.type(screen.getByRole("textbox"), "¿Qué tal?");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(cuerposChat).toHaveLength(2));

    expect(cuerposChat[0]).toEqual({ mensaje: "Hola" });
    expect(cuerposChat[1]).toEqual({
      mensaje: "¿Qué tal?",
      historial: [
        { role: "user", content: "Hola" },
        { role: "assistant", content: "Hola mundo" },
      ],
    });
  });

  it("envía con Enter y respeta Shift+Enter en el textarea", async () => {
    const sse = crearSse();
    mockApi({ chat: () => sse.response });
    const user = userEvent.setup();
    renderChat();

    const caja = await cajaDeTexto();
    await user.type(caja, "linea uno");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(caja).toHaveValue("linea uno\n");
    expect(cuerposChat).toHaveLength(0);

    await user.type(caja, "linea dos");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(cuerposChat).toHaveLength(1));
    expect(cuerposChat[0]?.mensaje).toBe("linea uno\nlinea dos");
    await cerrar(sse);
  });
});
