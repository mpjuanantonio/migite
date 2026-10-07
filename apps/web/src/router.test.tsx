import type { ObjectPayload } from "@migite/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { jsonResponse, renderApp, sesionResponse } from "@/test/render-app";

const objetoDePrueba = (): ObjectPayload => ({
  id: "01JALFA0000000000000000000",
  tipo: "nota",
  titulo: "Ficha de prueba",
  ruta: "notas/ficha.md",
  carpeta: "notas",
  creado: "2026-10-01T10:00:00.000Z",
  actualizado: "2026-10-05T18:30:00.000Z",
  atributos: {},
  cuerpo: "Cuerpo de la ficha",
  enlaces: [],
  degraded: [],
});

let fetchMock: Mock<typeof fetch>;

const mockSesion = (autenticado: boolean): void => {
  fetchMock.mockResolvedValue(sesionResponse(autenticado));
};

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shell de la SPA", () => {
  it("monta el layout con la navegación y la página de notas", async () => {
    mockSesion(true);
    renderApp("/notas");

    expect(await screen.findByRole("heading", { level: 1, name: "Notas" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    for (const label of ["Notas", "Tareas", "Calendario", "Proyectos", "Tipos", "Buscar"]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Saltar al contenido" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Español" })).toHaveAttribute("aria-pressed", "true");
  });

  it("redirige la raíz a notas", async () => {
    mockSesion(true);
    renderApp("/");

    expect(await screen.findByRole("heading", { level: 1, name: "Notas" })).toBeInTheDocument();
  });

  it("cambia todo el texto al inglés desde el selector del layout", async () => {
    mockSesion(true);
    const user = userEvent.setup();
    renderApp("/notas");

    await screen.findByRole("heading", { level: 1, name: "Notas" });
    await user.click(screen.getByRole("button", { name: "Inglés" }));

    expect(screen.getByRole("heading", { level: 1, name: "Notes" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });

  it("muestra el acceso como página independiente, sin navegación", async () => {
    mockSesion(false);
    renderApp("/login");

    expect(await screen.findByRole("heading", { level: 1, name: "Acceso" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Navegación principal" })).toBeNull();
  });

  it("muestra la ficha de un objeto de la ruta", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).startsWith("/api/objetos/")
        ? jsonResponse(objetoDePrueba())
        : sesionResponse(true),
    );
    renderApp("/objetos/01JALFA0000000000000000000");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Ficha de prueba" }),
    ).toBeInTheDocument();
  });
});
