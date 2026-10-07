import type { CreateObjectBody, ObjectPayload } from "@migite/contracts";
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { formatFecha } from "@/lib/fecha";
import { errorResponse, jsonResponse, renderApp, sesionResponse } from "@/test/render-app";

let fetchMock: Mock<typeof fetch>;
let listados: URL[];

const horaRelativa = (ms: number): string => new Date(Date.now() + ms).toISOString();

const recordatorio = (
  id: string,
  titulo: string,
  hora: string,
  estado = "pendiente",
): ObjectPayload => ({
  id,
  tipo: "recordatorio",
  titulo,
  ruta: `recordatorios/${id}.md`,
  carpeta: "recordatorios",
  creado: "2026-10-01T10:00:00.000Z",
  actualizado: "2026-10-05T10:00:00.000Z",
  atributos: { hora, estado },
  cuerpo: "",
  enlaces: [],
  degraded: [],
});

const mockApi = (recordatorios: readonly ObjectPayload[] = []): void => {
  const actuales = [...recordatorios];

  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";

    if (url.pathname === "/api/sesion") {
      return sesionResponse(true);
    }

    if (url.pathname === "/api/objetos" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as CreateObjectBody;
      const hora = body.atributos?.hora;
      const creado = recordatorio("CREADA", body.titulo, typeof hora === "string" ? hora : "");
      actuales.unshift(creado);
      return jsonResponse(creado, 201);
    }

    if (url.pathname === "/api/objetos") {
      listados.push(url);
      return jsonResponse({ objetos: actuales, siguienteCursor: null });
    }

    return errorResponse("not_found", "No existe la ruta", 404);
  });
};

const renderRecordatorios = () =>
  renderApp("/recordatorios", new QueryClient({ defaultOptions: { queries: { retry: false } } }));

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
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("vista de recordatorios", () => {
  it("consulta los próximos por defecto y cambia a vencidos y todos", async () => {
    mockApi();
    const user = userEvent.setup();
    renderRecordatorios();

    await screen.findByText("No hay recordatorios próximos.");

    const primera = listados[0];
    expect(primera?.searchParams.get("tipo")).toBe("recordatorio");
    expect(primera?.searchParams.get("limite")).toBe("20");
    const desde = primera?.searchParams.get("rango.hora.desde");
    expect(desde).not.toBeNull();
    const desdeMs = new Date(String(desde)).getTime();
    expect(desdeMs).toBeLessThanOrEqual(Date.now() + 1_000);
    expect(desdeMs).toBeGreaterThan(Date.now() - 60_000);
    expect(primera?.searchParams.get("rango.hora.hasta")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Vencidos" }));
    await waitFor(() => {
      const ultima = listados.at(-1);
      expect(ultima?.searchParams.get("rango.hora.hasta")).not.toBeNull();
      expect(ultima?.searchParams.get("rango.hora.desde")).toBeNull();
      expect(ultima?.searchParams.get("tipo")).toBe("recordatorio");
    });

    await user.click(screen.getByRole("button", { name: "Todos" }));
    await waitFor(() => {
      const ultima = listados.at(-1);
      expect(ultima?.searchParams.get("rango.hora.desde")).toBeNull();
      expect(ultima?.searchParams.get("rango.hora.hasta")).toBeNull();
      expect(ultima?.searchParams.get("tipo")).toBe("recordatorio");
    });
  });

  it("muestra la hora y calcula el chip por la hora, no por el atributo", async () => {
    const futura = horaRelativa(3_600_000);
    const pasada = horaRelativa(-3_600_000);
    mockApi([
      recordatorio("A", "Pagar luz", futura, "vencido"),
      recordatorio("B", "Llamar médico", pasada, "pendiente"),
    ]);
    renderRecordatorios();

    await screen.findByRole("link", { name: "Pagar luz" });

    const pendiente = filaDe("Pagar luz");
    expect(within(pendiente).getByRole("link")).toHaveAttribute("href", "/objetos/A");
    expect(within(pendiente).getByText("pendiente", { selector: "span" })).toBeInTheDocument();
    expect(within(pendiente).queryByText("Vencido")).toBeNull();
    expect(pendiente.querySelector("time")).toHaveAttribute("datetime", futura);
    expect(pendiente.querySelector("time")?.textContent).toBe(formatFecha(futura, "es"));

    const vencido = filaDe("Llamar médico");
    expect(within(vencido).getByText("vencido", { selector: "span" })).toBeInTheDocument();
    expect(within(vencido).getByText("Vencido")).toBeInTheDocument();
    expect(vencido.querySelector("time")).toHaveAttribute("datetime", pasada);
  });

  it("ordena los próximos por hora aunque el API los devuelva desordenados", async () => {
    const pronto = horaRelativa(1_800_000);
    const tarde = horaRelativa(7_200_000);
    mockApi([recordatorio("A", "Tarde", tarde), recordatorio("B", "Pronto", pronto)]);
    renderRecordatorios();

    await screen.findByRole("link", { name: "Tarde" });

    const main = screen.getByRole("main");
    const filas = within(main).getAllByRole("listitem");
    expect(
      within(filas[0] as HTMLElement).getByRole("link", { name: "Pronto" }),
    ).toBeInTheDocument();
    expect(
      within(filas[1] as HTMLElement).getByRole("link", { name: "Tarde" }),
    ).toBeInTheDocument();
  });

  it("crea un recordatorio con hora y estado pendiente", async () => {
    mockApi();
    const user = userEvent.setup();
    renderRecordatorios();

    await screen.findByText("No hay recordatorios próximos.");
    await user.click(screen.getByRole("button", { name: "Nuevo recordatorio" }));
    await user.type(await screen.findByLabelText("Título"), "Sacar la basura");
    await user.type(screen.getByLabelText("Fecha y hora"), "2026-10-20T14:30");
    await user.click(screen.getByRole("button", { name: "Crear recordatorio" }));

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
      expect(posts).toHaveLength(1);
      expect(posts[0]?.[0]).toBe("/api/objetos");
      expect(JSON.parse(String(posts[0]?.[1]?.body))).toEqual({
        tipo: "recordatorio",
        titulo: "Sacar la basura",
        atributos: {
          hora: new Date("2026-10-20T14:30").toISOString(),
          estado: "pendiente",
        },
      });
    });
    await waitFor(() => expect(screen.queryByLabelText("Título")).toBeNull());
    expect(await screen.findByRole("link", { name: "Sacar la basura" })).toBeInTheDocument();
  });

  it("navega desde el rail de navegación", async () => {
    mockApi();
    const user = userEvent.setup();
    renderRecordatorios();

    await screen.findByRole("heading", { level: 1, name: "Recordatorios" });
    const rail = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(within(rail).getByRole("link", { name: "Recordatorios" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.click(within(rail).getByRole("link", { name: "Calendario" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Calendario" }),
    ).toBeInTheDocument();

    await user.click(within(rail).getByRole("link", { name: "Recordatorios" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Recordatorios" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(listados.length).toBeGreaterThan(1));
  });
});
