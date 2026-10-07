import type { CreateObjectBody, ObjectPayload } from "@migite/contracts";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
  claveDia,
  etiquetaMes,
  finDeMes,
  formatearHora,
  HOLGURA_DIAS,
  inicioDeMes,
  sumarDias,
} from "@/lib/calendario";
import { errorResponse, jsonResponse, renderApp, sesionResponse } from "@/test/render-app";

let fetchMock: Mock<typeof fetch>;
let listados: URL[];
let posts: { readonly url: string; readonly body: CreateObjectBody }[];

const ahora = new Date();
const mesActual = inicioDeMes(ahora);

const diaEnMes = (dia: number, hora = 10, minuto = 0): Date =>
  new Date(ahora.getFullYear(), ahora.getMonth(), dia, hora, minuto);

type OpcionesEvento = {
  readonly fin?: Date;
  readonly todoElDia?: boolean;
};

const evento = (
  id: string,
  titulo: string,
  inicio: Date,
  opciones: OpcionesEvento = {},
): ObjectPayload => ({
  id,
  tipo: "evento",
  titulo,
  ruta: `eventos/${id}.md`,
  carpeta: "eventos",
  creado: "2026-10-01T10:00:00.000Z",
  actualizado: "2026-10-05T10:00:00.000Z",
  atributos: {
    inicio: inicio.toISOString(),
    ...(opciones.fin === undefined ? {} : { fin: opciones.fin.toISOString() }),
    todoElDia: opciones.todoElDia === true,
  },
  cuerpo: "",
  enlaces: [],
  degraded: [],
});

const mockApi = (eventos: readonly ObjectPayload[] = []): void => {
  const actuales = [...eventos];

  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";

    if (url.pathname === "/api/sesion") {
      return sesionResponse(true);
    }

    if (url.pathname === "/api/objetos" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as CreateObjectBody;
      posts.push({ url: String(input), body });
      const creado: ObjectPayload = {
        id: "CREADO",
        tipo: "evento",
        titulo: body.titulo,
        ruta: "eventos/creado.md",
        carpeta: "eventos",
        creado: "2026-10-01T10:00:00.000Z",
        actualizado: "2026-10-05T10:00:00.000Z",
        atributos: { ...(body.atributos ?? {}) },
        cuerpo: body.cuerpo ?? "",
        enlaces: [],
        degraded: [],
      };
      actuales.push(creado);
      return jsonResponse(creado, 201);
    }

    if (url.pathname === "/api/objetos") {
      listados.push(url);
      return jsonResponse({ objetos: actuales, siguienteCursor: null });
    }

    if (url.pathname.startsWith("/api/objetos/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/objetos/".length));
      const encontrado = actuales.find((item) => item.id === id);
      return encontrado === undefined
        ? errorResponse("not_found", "No existe la ficha", 404)
        : jsonResponse(encontrado);
    }

    return errorResponse("not_found", "No existe la ruta", 404);
  });
};

const renderCalendario = () =>
  renderApp("/calendario", new QueryClient({ defaultOptions: { queries: { retry: false } } }));

const celdaDe = (clave: string): HTMLElement => {
  const celda = document.querySelector<HTMLElement>(`td[data-dia="${clave}"]`);
  if (celda === null) {
    throw new Error(`no se encontró la celda de ${clave}`);
  }
  return celda;
};

beforeEach(() => {
  localStorage.clear();
  listados = [];
  posts = [];
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("vista de calendario mensual", () => {
  it("coloca cada evento en su día, muestra la hora y destaca los de todo el día", async () => {
    const reunion = diaEnMes(5, 10, 0);
    const festivo = diaEnMes(12);
    mockApi([
      evento("E1", "Revisión trimestral", reunion),
      evento("E2", "Cumpleaños de Ana", festivo, { todoElDia: true }),
      evento("E3", "Comida de equipo", diaEnMes(12, 14, 30)),
    ]);
    renderCalendario();

    await screen.findByRole("link", { name: /Revisión trimestral/ });

    expect(screen.getByRole("heading", { level: 1, name: "Calendario" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: etiquetaMes(mesActual, "es") }),
    ).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Lun" })).toBeInTheDocument();

    const celdaReunion = celdaDe(claveDia(reunion));
    expect(
      within(celdaReunion).getByRole("link", { name: /Revisión trimestral/ }),
    ).toBeInTheDocument();
    expect(within(celdaReunion).getByText(formatearHora(reunion, "es"))).toBeInTheDocument();

    const celdaFestivo = celdaDe(claveDia(festivo));
    const enlaces = within(celdaFestivo).getAllByRole("link");
    expect(enlaces).toHaveLength(2);
    expect(enlaces[0]).toHaveTextContent("Cumpleaños de Ana");
    expect(enlaces[0]).toHaveAttribute("data-todo-el-dia", "true");
    expect(enlaces[1]).toHaveTextContent("Comida de equipo");
  });

  it("navega entre meses y actualiza el rango de la consulta", async () => {
    mockApi();
    const user = userEvent.setup();
    renderCalendario();

    await waitFor(() => expect(listados.length).toBeGreaterThan(0));

    const primera = listados[0];
    expect(primera?.searchParams.get("tipo")).toBe("evento");
    expect(primera?.searchParams.get("limite")).toBe("500");
    expect(new Date(String(primera?.searchParams.get("rango.inicio.desde"))).getTime()).toBe(
      sumarDias(inicioDeMes(mesActual), -HOLGURA_DIAS).getTime(),
    );
    expect(new Date(String(primera?.searchParams.get("rango.inicio.hasta"))).getTime()).toBe(
      finDeMes(mesActual).getTime(),
    );

    const siguiente = new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 1);
    await user.click(screen.getByRole("button", { name: "Mes siguiente" }));
    await waitFor(() => {
      const ultima = listados.at(-1);
      expect(new Date(String(ultima?.searchParams.get("rango.inicio.hasta"))).getTime()).toBe(
        finDeMes(siguiente).getTime(),
      );
    });
    expect(
      screen.getByRole("heading", { level: 2, name: etiquetaMes(siguiente, "es") }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hoy" }));
    expect(
      screen.getByRole("heading", { level: 2, name: etiquetaMes(mesActual, "es") }),
    ).toBeInTheDocument();

    const anterior = new Date(mesActual.getFullYear(), mesActual.getMonth() - 1, 1);
    await user.click(screen.getByRole("button", { name: "Mes anterior" }));
    expect(
      screen.getByRole("heading", { level: 2, name: etiquetaMes(anterior, "es") }),
    ).toBeInTheDocument();
  });

  it("crea un evento con inicio, fin y notas desde la celda de un día", async () => {
    mockApi();
    const user = userEvent.setup();
    renderCalendario();

    await screen.findByRole("button", { name: "Nuevo evento" });

    const dia = diaEnMes(20);
    await user.click(within(celdaDe(claveDia(dia))).getByRole("button"));

    const inicio = await screen.findByLabelText("Inicio");
    expect(inicio).toHaveValue(`${claveDia(dia)}T09:00`);
    fireEvent.change(inicio, { target: { value: `${claveDia(dia)}T14:30` } });
    fireEvent.change(screen.getByLabelText("Fin (opcional)"), {
      target: { value: `${claveDia(dia)}T16:00` },
    });
    await user.type(screen.getByLabelText("Título"), "Ensayo de coro");
    await user.type(screen.getByLabelText("Notas (opcional)"), "Llevar partituras");
    await user.click(screen.getByRole("button", { name: "Crear evento" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.url).toBe("/api/objetos");
    expect(posts[0]?.body).toEqual({
      tipo: "evento",
      titulo: "Ensayo de coro",
      atributos: {
        inicio: diaEnMes(20, 14, 30).toISOString(),
        fin: diaEnMes(20, 16, 0).toISOString(),
        todoElDia: false,
      },
      cuerpo: "Llevar partituras",
    });
    expect(await screen.findByRole("link", { name: /Ensayo de coro/ })).toBeInTheDocument();
  });

  it("crea un evento de todo el día", async () => {
    mockApi();
    const user = userEvent.setup();
    renderCalendario();

    await user.click(await screen.findByRole("button", { name: "Nuevo evento" }));
    await user.type(await screen.findByLabelText("Título"), "Festivo local");
    await user.click(screen.getByRole("switch", { name: "Todo el día" }));

    const dia = diaEnMes(15);
    fireEvent.change(screen.getByLabelText("Inicio"), { target: { value: claveDia(dia) } });
    await user.type(screen.getByLabelText("Notas (opcional)"), "Sin clase");
    await user.click(screen.getByRole("button", { name: "Crear evento" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.body).toEqual({
      tipo: "evento",
      titulo: "Festivo local",
      atributos: {
        inicio: new Date(`${claveDia(dia)}T00:00:00`).toISOString(),
        todoElDia: true,
      },
      cuerpo: "Sin clase",
    });

    const chip = await screen.findByRole("link", { name: /Festivo local/ });
    expect(chip).toHaveAttribute("data-todo-el-dia", "true");
    expect(within(celdaDe(claveDia(dia))).getByRole("link", { name: /Festivo local/ })).toBe(chip);
  });

  it("navega a la ficha al hacer click en un evento", async () => {
    mockApi([evento("EV1", "Dentista", diaEnMes(8, 12, 0))]);
    const user = userEvent.setup();
    const { router } = renderCalendario();

    await user.click(await screen.findByRole("link", { name: /Dentista/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/objetos/EV1"));
  });

  it("incluye eventos que empiezan antes del mes si solapan con él", async () => {
    const vispera = sumarDias(mesActual, -1);
    const inicioLargo = new Date(
      vispera.getFullYear(),
      vispera.getMonth(),
      vispera.getDate(),
      20,
      0,
    );
    const finLargo = new Date(mesActual.getFullYear(), mesActual.getMonth(), 1, 8, 0);
    const inicioPasado = new Date(
      vispera.getFullYear(),
      vispera.getMonth(),
      vispera.getDate(),
      20,
      0,
    );
    const finPasado = new Date(vispera.getFullYear(), vispera.getMonth(), vispera.getDate(), 22, 0);
    mockApi([
      evento("L1", "Retiro de equipo", inicioLargo, { fin: finLargo }),
      evento("V1", "Ya terminó", inicioPasado, { fin: finPasado }),
    ]);
    renderCalendario();

    await screen.findByRole("link", { name: /Retiro de equipo/ });
    expect(screen.queryByRole("link", { name: /Ya terminó/ })).toBeNull();

    const celda = celdaDe(claveDia(mesActual));
    expect(within(celda).getByRole("link", { name: /Retiro de equipo/ })).toBeInTheDocument();

    await waitFor(() => expect(listados.length).toBeGreaterThan(0));
    const desde = new Date(String(listados[0]?.searchParams.get("rango.inicio.desde"))).getTime();
    expect(desde).toBeLessThanOrEqual(inicioLargo.getTime());
  });
});
