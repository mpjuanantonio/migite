import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { createQueryClient } from "@/api/client";
import { queryKeys } from "@/api/keys";
import { errorResponse, noContentResponse, renderApp, sesionResponse } from "@/test/render-app";

let fetchMock: Mock<typeof fetch>;

type SesionApiOptions = {
  readonly autenticado: boolean;
  readonly post?: Response;
};

const mockSesionApi = ({ autenticado, post }: SesionApiOptions): void => {
  fetchMock.mockImplementation(async (_input, init) => {
    if ((init?.method ?? "GET") === "POST") {
      return post ?? noContentResponse();
    }
    return sesionResponse(autenticado);
  });
};

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("página de acceso", () => {
  it("inicia sesión y navega a notas", async () => {
    mockSesionApi({ autenticado: false });
    const user = userEvent.setup();
    renderApp("/login");

    await user.type(await screen.findByLabelText("Usuario"), "ana");
    await user.type(screen.getByLabelText("Contraseña"), "secreta");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Notas" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sesion",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ usuario: "ana", contrasena: "secreta" }),
      }),
    );
  });

  it("vuelve a la ruta de origen tras iniciar sesión con Enter", async () => {
    mockSesionApi({ autenticado: false });
    const user = userEvent.setup();
    const { router } = renderApp("/tareas");

    expect(await screen.findByRole("heading", { level: 1, name: "Acceso" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Usuario"), "ana");
    await user.type(screen.getByLabelText("Contraseña"), "secreta{Enter}");

    expect(await screen.findByRole("heading", { level: 1, name: "Tareas" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/tareas");
  });

  it("muestra el error genérico del contrato y permanece en el acceso", async () => {
    mockSesionApi({
      autenticado: false,
      post: errorResponse("unauthorized", "Se requiere autenticación", 401),
    });
    const user = userEvent.setup();
    renderApp("/login");

    await user.type(await screen.findByLabelText("Usuario"), "ana");
    await user.type(screen.getByLabelText("Contraseña"), "mala");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Se requiere autenticación");
    expect(screen.getByRole("heading", { level: 1, name: "Acceso" })).toBeInTheDocument();
  });
});

describe("cierre de sesión", () => {
  it("cierra la sesión, limpia la cache y vuelve al acceso", async () => {
    let autenticado = true;
    fetchMock.mockImplementation(async (_input, init) => {
      if ((init?.method ?? "GET") === "DELETE") {
        autenticado = false;
        return noContentResponse();
      }
      return sesionResponse(autenticado);
    });
    const client = createQueryClient();
    const objetosKey = [...queryKeys.objetos, {}];
    client.setQueryData(objetosKey, { objetos: [] });
    const user = userEvent.setup();
    const { router } = renderApp("/notas", client);

    expect(await screen.findByRole("heading", { level: 1, name: "Notas" })).toBeInTheDocument();
    expect(client.getQueryData(queryKeys.sesion)).toEqual({ autenticado: true });

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Acceso" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sesion",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(router.state.location.pathname).toBe("/login");
    expect(client.getQueryData(objetosKey)).toBeUndefined();
    expect(client.getQueryData(queryKeys.sesion)).toEqual({ autenticado: false });
  });
});

describe("guard de sesión", () => {
  it("redirige a acceso cuando no hay sesión", async () => {
    mockSesionApi({ autenticado: false });
    renderApp("/notas");

    expect(await screen.findByRole("heading", { level: 1, name: "Acceso" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Navegación principal" })).toBeNull();
  });

  it("muestra la ruta protegida cuando hay sesión", async () => {
    mockSesionApi({ autenticado: true });
    renderApp("/notas");

    expect(await screen.findByRole("heading", { level: 1, name: "Notas" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Acceso" })).toBeNull();
  });

  it("redirige fuera del acceso cuando ya hay sesión", async () => {
    mockSesionApi({ autenticado: true });
    renderApp("/login");

    expect(await screen.findByRole("heading", { level: 1, name: "Notas" })).toBeInTheDocument();
  });
});
