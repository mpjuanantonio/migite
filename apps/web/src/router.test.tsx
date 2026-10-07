import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { createQueryClient } from "@/api/client";
import { I18nProvider } from "@/i18n/context";
import { routes } from "@/router";

const renderAt = (path: string) => {
  render(
    <I18nProvider>
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
      </QueryClientProvider>
    </I18nProvider>,
  );
};

beforeEach(() => {
  localStorage.clear();
});

describe("shell de la SPA", () => {
  it("monta el layout con la navegación y la página de notas", () => {
    renderAt("/notas");

    expect(screen.getByRole("heading", { level: 1, name: "Notas" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    for (const label of ["Notas", "Tareas", "Calendario", "Proyectos", "Tipos", "Buscar"]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Saltar al contenido" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Español" })).toHaveAttribute("aria-pressed", "true");
  });

  it("redirige la raíz a notas", () => {
    renderAt("/");

    expect(screen.getByRole("heading", { level: 1, name: "Notas" })).toBeInTheDocument();
  });

  it("cambia todo el texto al inglés desde el selector del layout", async () => {
    const user = userEvent.setup();
    renderAt("/notas");

    await user.click(screen.getByRole("button", { name: "Inglés" }));

    expect(screen.getByRole("heading", { level: 1, name: "Notes" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });

  it("muestra el acceso como página independiente, sin navegación", () => {
    renderAt("/login");

    expect(screen.getByRole("heading", { level: 1, name: "Acceso" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Navegación principal" })).toBeNull();
  });

  it("muestra el identificador en una ficha de objeto", () => {
    renderAt("/objetos/01JALFA0000000000000000000");

    expect(screen.getByRole("heading", { level: 1, name: "Ficha" })).toBeInTheDocument();
    expect(screen.getByText("01JALFA0000000000000000000")).toBeInTheDocument();
  });
});
