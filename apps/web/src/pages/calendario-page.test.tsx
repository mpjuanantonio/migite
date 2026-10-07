import type { CreateObjectBody, ObjectPayload } from "@migite/contracts";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
  claveDia,
  construirSemana,
  etiquetaDia,
  etiquetaMes,
  etiquetaSemana,
  finDeMes,
  finDeSemana,
  formatearHora,
  HOLGURA_DIAS,
  inicioDeMes,
  sumarDias,
} from "@/lib/calendario";
import { errorResponse, jsonResponse, renderApp, sesionResponse } from "@/test/render-app";

let fetchMock: Mock<typeof fetch>;
let listados: URL[];
let posts: { readonly url: string; readonly body: CreateObjectBody }[];
let parches: { readonly id: string; readonly atributos: Record<string, unknown> }[];

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

type OpcionesMock = {
  readonly falloPatch?: boolean;
};

const mockApi = (eventos: readonly ObjectPayload[] = [], opciones: OpcionesMock = {}): void => {
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

    if (url.pathname.startsWith("/api/objetos/") && method === "PATCH") {
      const id = decodeURIComponent(url.pathname.slice("/api/objetos/".length));
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        atributos?: Record<string, unknown>;
      };
      const atributos = body.atributos ?? {};
      parches.push({ id, atributos });
      if (opciones.falloPatch === true) {
        return errorResponse("save_error", "No se pudieron guardar los cambios", 500);
      }
      const indice = actuales.findIndex((item) => item.id === id);
      const previo = actuales[indice];
      if (previo === undefined) {
        return errorResponse("not_found", "No existe la ficha", 404);
      }
      const actualizado: ObjectPayload = {
        ...previo,
        atributos: { ...previo.atributos, ...atributos },
      };
      actuales[indice] = actualizado;
      return jsonResponse(actualizado);
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

const columnaDe = (vista: "semana" | "dia", clave: string): HTMLElement => {
  const columna = document.querySelector<HTMLElement>(
    `[data-vista="${vista}"] [data-dia="${clave}"]`,
  );
  if (columna === null) {
    throw new Error(`no se encontró la columna de ${clave} en la vista ${vista}`);
  }
  return columna;
};

const dataTransfer = (): DataTransfer =>
  ({
    setData: vi.fn(),
    effectAllowed: "none",
  }) as unknown as DataTransfer;

beforeEach(() => {
  localStorage.clear();
  listados = [];
  posts = [];
  parches = [];
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

describe("vistas de semana y día", () => {
  it("cambia de vista y recuerda la elección durante la sesión", async () => {
    mockApi();
    const user = userEvent.setup();
    const { unmount } = renderCalendario();

    const mes = await screen.findByRole("button", { name: "Mes" });
    expect(mes).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Semana" })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "Semana" }));
    expect(screen.getByRole("button", { name: "Semana" })).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector('[data-vista="semana"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Semana anterior" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Semana siguiente" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Día" }));
    expect(document.querySelector('[data-vista="dia"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Día anterior" })).toBeInTheDocument();

    unmount();
    renderCalendario();

    expect(await screen.findByRole("button", { name: "Día" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(document.querySelector('[data-vista="dia"]')).not.toBeNull();
  });

  it("coloca los eventos de la semana en su franja y los de todo el día en la banda", async () => {
    const semana = construirSemana(ahora, ahora);
    const miercoles = semana[2]?.fecha ?? ahora;
    const inicio = new Date(
      miercoles.getFullYear(),
      miercoles.getMonth(),
      miercoles.getDate(),
      10,
      0,
    );
    const fin = new Date(
      miercoles.getFullYear(),
      miercoles.getMonth(),
      miercoles.getDate(),
      11,
      30,
    );
    const paralelaInicio = new Date(
      miercoles.getFullYear(),
      miercoles.getMonth(),
      miercoles.getDate(),
      10,
      30,
    );
    const paralelaFin = new Date(
      miercoles.getFullYear(),
      miercoles.getMonth(),
      miercoles.getDate(),
      11,
      30,
    );
    mockApi([
      evento("S1", "Reunión semanal", inicio, { fin }),
      evento("S2", "Paralela", paralelaInicio, { fin: paralelaFin }),
      evento("S3", "Festivo", miercoles, { todoElDia: true }),
    ]);
    const user = userEvent.setup();
    renderCalendario();

    await user.click(await screen.findByRole("button", { name: "Semana" }));

    const cabeceraHoy = document.querySelector(`[data-cabecera="${claveDia(ahora)}"]`);
    expect(cabeceraHoy).toHaveAttribute("data-hoy", "true");

    const columna = columnaDe("semana", claveDia(miercoles));
    const reunion = within(columna).getByRole("link", { name: /Reunión semanal/ });
    expect(reunion).toHaveAttribute("data-evento", "S1");
    expect(Number.parseFloat(reunion.style.top)).toBeCloseTo((600 / 1440) * 100, 3);
    expect(Number.parseFloat(reunion.style.height)).toBeCloseTo((90 / 1440) * 100, 3);
    expect(reunion.style.left).toBe("0%");

    const paralela = within(columna).getByRole("link", { name: /Paralela/ });
    expect(paralela.style.left).toBe("50%");
    expect(paralela.style.width).toBe("50%");

    const banda = document.querySelector<HTMLElement>(
      `[data-todo-el-dia="${claveDia(miercoles)}"]`,
    );
    expect(banda).not.toBeNull();
    expect(within(banda as HTMLElement).getByRole("link", { name: /Festivo/ })).toBeInTheDocument();
    expect(within(columna).queryByRole("link", { name: /Festivo/ })).toBeNull();
  });

  it("muestra el día con la fecha completa y sus eventos posicionados", async () => {
    const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 14, 0);
    const fin = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 15, 0);
    mockApi([evento("D1", "Fisioterapia", inicio, { fin })]);
    const user = userEvent.setup();
    renderCalendario();

    await user.click(await screen.findByRole("button", { name: "Día" }));

    expect(
      screen.getByRole("heading", { level: 2, name: etiquetaDia(ahora, "es") }),
    ).toBeInTheDocument();
    const seccion = document.querySelector<HTMLElement>(
      `[data-vista="dia"][aria-label="${etiquetaDia(ahora, "es")}"]`,
    );
    expect(seccion).not.toBeNull();
    expect(seccion?.querySelectorAll("[data-dia]")).toHaveLength(1);

    const columna = columnaDe("dia", claveDia(ahora));
    const enlace = within(columna).getByRole("link", { name: /Fisioterapia/ });
    expect(Number.parseFloat(enlace.style.top)).toBeCloseTo((840 / 1440) * 100, 3);
    expect(Number.parseFloat(enlace.style.height)).toBeCloseTo((60 / 1440) * 100, 3);
    expect(within(columna).getAllByRole("button")).toHaveLength(24);
  });

  it("navega por semanas y por días según la vista activa", async () => {
    mockApi();
    const user = userEvent.setup();
    renderCalendario();

    await screen.findByRole("button", { name: "Nuevo evento" });
    await user.click(screen.getByRole("button", { name: "Semana" }));

    expect(
      screen.getByRole("heading", { level: 2, name: etiquetaSemana(ahora, "es") }),
    ).toBeInTheDocument();
    await waitFor(() => {
      const ultima = listados.at(-1);
      expect(new Date(String(ultima?.searchParams.get("rango.inicio.hasta"))).getTime()).toBe(
        finDeSemana(ahora).getTime(),
      );
    });

    await user.click(screen.getByRole("button", { name: "Semana siguiente" }));
    expect(
      screen.getByRole("heading", { level: 2, name: etiquetaSemana(sumarDias(ahora, 7), "es") }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hoy" }));
    expect(
      screen.getByRole("heading", { level: 2, name: etiquetaSemana(ahora, "es") }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Día" }));
    expect(
      screen.getByRole("heading", { level: 2, name: etiquetaDia(ahora, "es") }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Día anterior" }));
    expect(
      screen.getByRole("heading", { level: 2, name: etiquetaDia(sumarDias(ahora, -1), "es") }),
    ).toBeInTheDocument();
  });

  it("abre el diálogo con la fecha y hora del hueco pulsado", async () => {
    mockApi();
    const user = userEvent.setup();
    renderCalendario();

    await user.click(await screen.findByRole("button", { name: "Día" }));

    const hueco = columnaDe("dia", claveDia(ahora)).querySelector<HTMLButtonElement>(
      'button[data-hora="15"]',
    );
    expect(hueco).not.toBeNull();
    await user.click(hueco as HTMLButtonElement);

    expect(await screen.findByLabelText("Inicio")).toHaveValue(`${claveDia(ahora)}T15:00`);
  });
});

describe("mover eventos arrastrando", () => {
  it("mueve un evento de mes a otro día conservando la hora y la duración", async () => {
    mockApi([
      evento("M1", "Revisión trimestral", diaEnMes(5, 10, 0), { fin: diaEnMes(5, 11, 30) }),
    ]);
    renderCalendario();

    const chip = await screen.findByRole("link", { name: /Revisión trimestral/ });
    const dt = dataTransfer();
    fireEvent.dragStart(chip, { dataTransfer: dt });
    fireEvent.drop(celdaDe(claveDia(diaEnMes(12))), { dataTransfer: dt });

    const destino = diaEnMes(12, 10, 0);
    expect(
      within(celdaDe(claveDia(destino))).getByRole("link", { name: /Revisión trimestral/ }),
    ).toBeInTheDocument();

    await waitFor(() => expect(parches).toHaveLength(1));
    expect(parches[0]).toEqual({
      id: "M1",
      atributos: {
        inicio: destino.toISOString(),
        fin: diaEnMes(12, 11, 30).toISOString(),
      },
    });
    expect(dt.setData).toHaveBeenCalledWith("text/plain", "M1");
  });

  it("mueve un evento de la semana a otra fecha y hora conservando la duración", async () => {
    const semana = construirSemana(ahora, ahora);
    const miercoles = semana[2]?.fecha ?? ahora;
    const jueves = semana[3]?.fecha ?? ahora;
    const inicio = new Date(
      miercoles.getFullYear(),
      miercoles.getMonth(),
      miercoles.getDate(),
      10,
      0,
    );
    const fin = new Date(miercoles.getFullYear(), miercoles.getMonth(), miercoles.getDate(), 11, 0);
    mockApi([evento("S1", "Reunión semanal", inicio, { fin })]);
    const user = userEvent.setup();
    renderCalendario();

    await user.click(await screen.findByRole("button", { name: "Semana" }));

    const chip = within(columnaDe("semana", claveDia(miercoles))).getByRole("link", {
      name: /Reunión semanal/,
    });
    const dt = dataTransfer();
    fireEvent.dragStart(chip, { dataTransfer: dt });

    const hueco = columnaDe("semana", claveDia(jueves)).querySelector<HTMLButtonElement>(
      'button[data-hora="15"]',
    );
    expect(hueco).not.toBeNull();
    fireEvent.drop(hueco as HTMLButtonElement, { dataTransfer: dt });

    expect(
      within(columnaDe("semana", claveDia(jueves))).getByRole("link", { name: /Reunión semanal/ }),
    ).toBeInTheDocument();

    const inicioDestino = new Date(
      jueves.getFullYear(),
      jueves.getMonth(),
      jueves.getDate(),
      15,
      0,
    );
    const finDestino = new Date(jueves.getFullYear(), jueves.getMonth(), jueves.getDate(), 16, 0);
    await waitFor(() => expect(parches).toHaveLength(1));
    expect(parches[0]).toEqual({
      id: "S1",
      atributos: { inicio: inicioDestino.toISOString(), fin: finDestino.toISOString() },
    });
  });

  it("mueve un evento de todo el día cambiando solo la fecha", async () => {
    const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 12);
    mockApi([evento("T1", "Festivo local", inicio, { todoElDia: true })]);
    renderCalendario();

    const chip = await screen.findByRole("link", { name: /Festivo local/ });
    const dt = dataTransfer();
    fireEvent.dragStart(chip, { dataTransfer: dt });
    fireEvent.drop(celdaDe(claveDia(diaEnMes(20))), { dataTransfer: dt });

    await waitFor(() => expect(parches).toHaveLength(1));
    expect(parches[0]).toEqual({
      id: "T1",
      atributos: { inicio: new Date(ahora.getFullYear(), ahora.getMonth(), 20).toISOString() },
    });
    expect(
      within(celdaDe(claveDia(diaEnMes(20)))).getByRole("link", { name: /Festivo local/ }),
    ).toBeInTheDocument();
  });

  it("no guarda cambios si se suelta en el mismo sitio", async () => {
    const inicio = diaEnMes(5, 10, 0);
    mockApi([evento("N1", "Sin cambios", inicio, { fin: diaEnMes(5, 11, 0) })]);
    renderCalendario();

    const chip = await screen.findByRole("link", { name: /Sin cambios/ });
    const dt = dataTransfer();
    fireEvent.dragStart(chip, { dataTransfer: dt });
    fireEvent.drop(celdaDe(claveDia(inicio)), { dataTransfer: dt });

    await new Promise((resolver) => setTimeout(resolver, 20));
    expect(parches).toHaveLength(0);
    expect(
      within(celdaDe(claveDia(inicio))).getByRole("link", { name: /Sin cambios/ }),
    ).toBeInTheDocument();
  });

  it("revierte el movimiento y avisa si falla el guardado", async () => {
    const inicio = diaEnMes(5, 10, 0);
    const fin = diaEnMes(5, 11, 0);
    mockApi([evento("F1", "Teletrabajo", inicio, { fin })], { falloPatch: true });
    renderCalendario();

    const chip = await screen.findByRole("link", { name: /Teletrabajo/ });
    const dt = dataTransfer();
    fireEvent.dragStart(chip, { dataTransfer: dt });
    fireEvent.drop(celdaDe(claveDia(diaEnMes(12))), { dataTransfer: dt });

    expect(
      within(celdaDe(claveDia(diaEnMes(12)))).getByRole("link", { name: /Teletrabajo/ }),
    ).toBeInTheDocument();

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("No se pudieron guardar los cambios");
    expect(
      within(celdaDe(claveDia(inicio))).getByRole("link", { name: /Teletrabajo/ }),
    ).toBeInTheDocument();
    expect(
      within(celdaDe(claveDia(diaEnMes(12)))).queryByRole("link", { name: /Teletrabajo/ }),
    ).toBeNull();
  });
});
