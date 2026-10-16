import type { Accion, ChatStreamEvent, Conversacion, Mensaje } from "@migite/contracts";
import { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { formatFecha } from "@/lib/fecha";
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

const conversacionC1: Conversacion = {
  id: "C1",
  titulo: "Notas del huerto",
  creada: "2026-10-12T09:00:00.000Z",
};

const conversacionC2: Conversacion = {
  id: "C2",
  titulo: "Compras",
  creada: "2026-10-10T08:30:00.000Z",
};

const mensajeUsuario: Mensaje = {
  id: "M1",
  rol: "user",
  contenido: "¿Cuántas notas hay?",
  creada: "2026-10-12T09:01:00.000Z",
};

const mensajeAsistente: Mensaje = {
  id: "M2",
  rol: "assistant",
  contenido: "Tienes 12 notas.",
  creada: "2026-10-12T09:01:05.000Z",
};

const FIN_VACIO: ChatStreamEvent = {
  tipo: "fin",
  contenido: "",
  pasos: 0,
  estado: "completado",
  accionesPropuestas: [],
};

type MockApiOptions = {
  readonly pendientes?: readonly Accion[];
  readonly conversaciones?: readonly Conversacion[];
  readonly mensajes?: Readonly<Record<string, readonly Mensaje[]>>;
  readonly chat?: () => Response;
  readonly confirmar?: (id: string) => Response;
  readonly rechazar?: (id: string) => Response;
  readonly eliminar?: (id: string) => Response;
};

let fetchMock: Mock<typeof fetch>;
let cuerposChat: { mensaje: string; conversacionId?: string }[];

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
    if (url.pathname === "/api/conversaciones" && method === "GET") {
      return jsonResponse({ conversaciones: options.conversaciones ?? [] });
    }
    if (url.pathname.startsWith("/api/conversaciones/") && url.pathname.endsWith("/mensajes")) {
      const id = decodeURIComponent(url.pathname.split("/")[3] ?? "");
      return jsonResponse({ mensajes: options.mensajes?.[id] ?? [] });
    }
    if (url.pathname.startsWith("/api/conversaciones/") && method === "DELETE") {
      const id = decodeURIComponent(url.pathname.split("/")[3] ?? "");
      return options.eliminar?.(id) ?? noContentResponse();
    }
    if (url.pathname === "/api/chat/mensajes" && method === "POST") {
      cuerposChat.push(
        JSON.parse(String(init?.body ?? "{}")) as {
          mensaje: string;
          conversacionId?: string;
        },
      );
      return options.chat?.() ?? sseCerrado([FIN_VACIO]);
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

  it("reutiliza el conversacionId del fin y no envía historial", async () => {
    const primera = crearSse();
    const segunda = crearSse();
    const respuestas = [primera, segunda];
    mockApi({ chat: () => respuestas.shift()?.response ?? sseCerrado([FIN_VACIO]) });
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
      conversacionId: "C1",
    });
    await cerrar(primera);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());

    await user.type(screen.getByRole("textbox"), "¿Qué tal?");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(cuerposChat).toHaveLength(2));

    expect(cuerposChat[0]).toEqual({ mensaje: "Hola" });
    expect(cuerposChat[1]).toEqual({ mensaje: "¿Qué tal?", conversacionId: "C1" });
    expect(cuerposChat.every((cuerpo) => !("historial" in cuerpo))).toBe(true);

    await cerrar(segunda);
  });

  it("la nueva conversación limpia el transcript y el siguiente envío va sin id", async () => {
    const primera = crearSse();
    const segunda = crearSse();
    const respuestas = [primera, segunda];
    mockApi({
      conversaciones: [conversacionC1],
      chat: () => respuestas.shift()?.response ?? sseCerrado([FIN_VACIO]),
    });
    const user = userEvent.setup();
    renderChat();

    await user.type(await cajaDeTexto(), "Hola");
    await user.keyboard("{Enter}");
    await emitir(primera, {
      tipo: "fin",
      contenido: "Hola mundo",
      pasos: 1,
      estado: "completado",
      accionesPropuestas: [],
      conversacionId: "C1",
    });
    await cerrar(primera);

    const activa = await screen.findByRole("button", { name: "Notas del huerto" });
    await waitFor(() => expect(activa).toHaveAttribute("aria-current", "true"));
    expect(screen.getByText("Hola mundo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Nueva conversación" }));

    expect(screen.queryByText("Hola mundo")).toBeNull();
    expect(await screen.findByText("Escribe un mensaje para empezar.")).toBeInTheDocument();
    expect(activa).not.toHaveAttribute("aria-current");

    await user.type(screen.getByRole("textbox"), "De cero");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(cuerposChat).toHaveLength(2));
    expect(cuerposChat[1]).toEqual({ mensaje: "De cero" });

    await cerrar(segunda);
  });

  it("carga el transcript de una conversación y continúa con su id", async () => {
    const sse = crearSse();
    mockApi({
      conversaciones: [conversacionC1, conversacionC2],
      mensajes: { C1: [mensajeUsuario, mensajeAsistente] },
      chat: () => sse.response,
    });
    const user = userEvent.setup();
    renderChat();

    await user.click(await screen.findByRole("button", { name: "Notas del huerto" }));

    expect(await screen.findByText("¿Cuántas notas hay?")).toBeInTheDocument();
    expect(screen.getByText("Tienes 12 notas.")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input]) =>
          new URL(String(input), "http://localhost").pathname === "/api/conversaciones/C1/mensajes",
      ),
    ).toBe(true);

    const caja = screen.getByRole("textbox");
    await waitFor(() => expect(caja).toBeEnabled());
    await user.type(caja, "Sigo con el huerto");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(cuerposChat).toHaveLength(1));
    expect(cuerposChat[0]).toEqual({ mensaje: "Sigo con el huerto", conversacionId: "C1" });

    await emitir(sse, {
      tipo: "fin",
      contenido: "De acuerdo",
      pasos: 1,
      estado: "completado",
      accionesPropuestas: [],
      conversacionId: "C1",
    });
    await cerrar(sse);
  });

  it("lista las conversaciones con su fecha y resalta la activa", async () => {
    mockApi({ conversaciones: [conversacionC1, conversacionC2] });
    const user = userEvent.setup();
    renderChat();

    expect(await screen.findByText("Notas del huerto")).toBeInTheDocument();
    expect(screen.getByText("Compras")).toBeInTheDocument();
    expect(
      screen.getByText(formatFecha(conversacionC1.creada, "es", { dateStyle: "medium" })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(formatFecha(conversacionC2.creada, "es", { dateStyle: "medium" })),
    ).toBeInTheDocument();

    const primera = screen.getByRole("button", { name: "Notas del huerto" });
    expect(primera).not.toHaveAttribute("aria-current");
    await user.click(primera);
    await waitFor(() => expect(primera).toHaveAttribute("aria-current", "true"));
    expect(screen.getByRole("button", { name: "Compras" })).not.toHaveAttribute("aria-current");
  });

  it("borra una conversación con confirmación breve y refresca la lista", async () => {
    const lista: Conversacion[] = [conversacionC1];
    const eliminadas: string[] = [];
    mockApi({
      conversaciones: lista,
      mensajes: { C1: [mensajeUsuario, mensajeAsistente] },
      eliminar: (id) => {
        eliminadas.push(id);
        lista.splice(0, lista.length);
        return noContentResponse();
      },
    });
    const user = userEvent.setup();
    renderChat();

    await user.click(await screen.findByRole("button", { name: "Notas del huerto" }));
    await screen.findByText("Tienes 12 notas.");

    await user.click(screen.getByRole("button", { name: "Borrar «Notas del huerto»" }));
    expect(screen.getByText("¿Borrar esta conversación?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Borrar" }));

    await waitFor(() => expect(eliminadas).toEqual(["C1"]));
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = new URL(String(input), "http://localhost");
        return url.pathname === "/api/conversaciones/C1" && init?.method === "DELETE";
      }),
    ).toBe(true);
    expect(await screen.findByText("Aún no hay conversaciones.")).toBeInTheDocument();
    expect(screen.queryByText("Tienes 12 notas.")).toBeNull();
    expect(screen.getByText("Escribe un mensaje para empezar.")).toBeInTheDocument();
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
