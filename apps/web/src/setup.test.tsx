import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { errorResponse, noContentResponse, renderApp, sesionResponse } from "@/test/render-app";

let fetchMock: Mock<typeof fetch>;

const mockSetupApi = (post?: Response): void => {
  fetchMock.mockImplementation(async (input, init) => {
    if (String(input) === "/api/sesion/setup" && (init?.method ?? "GET") === "POST") {
      return post ?? noContentResponse();
    }
    return sesionResponse(false, true);
  });
};

const completarFormulario = async (
  user: ReturnType<typeof userEvent.setup>,
  contrasena: string,
  confirmar: string,
): Promise<void> => {
  await user.type(await screen.findByLabelText("Usuario"), "ana");
  await user.type(screen.getByLabelText("Contraseña"), contrasena);
  await user.type(screen.getByLabelText("Confirmar contraseña"), confirmar);
  await user.click(screen.getByRole("button", { name: "Crear contraseña" }));
};

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pantalla de setup", () => {
  it("muestra el formulario de setup en vez del login", async () => {
    mockSetupApi();
    renderApp("/login");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Crea tu contraseña" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmar contraseña")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Entrar" })).toBeNull();
  });

  it("crea las credenciales, inicia sesión y navega a notas", async () => {
    mockSetupApi();
    const user = userEvent.setup();
    renderApp("/login");

    await completarFormulario(user, "secreto-largo", "secreto-largo");

    expect(await screen.findByRole("heading", { level: 1, name: "Notas" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sesion/setup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ usuario: "ana", contrasena: "secreto-largo" }),
      }),
    );
  });

  it("vuelve a la ruta de origen tras crear las credenciales", async () => {
    mockSetupApi();
    const user = userEvent.setup();
    const { router } = renderApp("/tareas");

    await completarFormulario(user, "secreto-largo", "secreto-largo");

    expect(await screen.findByRole("heading", { level: 1, name: "Tareas" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/tareas");
  });

  it("muestra un error local y no llama a la API si las contraseñas no coinciden", async () => {
    mockSetupApi();
    const user = userEvent.setup();
    renderApp("/login");

    await completarFormulario(user, "secreto-largo", "otra-contrasena");

    expect(await screen.findByRole("alert")).toHaveTextContent("Las contraseñas no coinciden");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/sesion/setup", expect.anything());
  });

  it("muestra un error local y no llama a la API si la contraseña es corta", async () => {
    mockSetupApi();
    const user = userEvent.setup();
    renderApp("/login");

    await completarFormulario(user, "corta", "corta");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La contraseña debe tener al menos 8 caracteres",
    );
    expect(fetchMock).not.toHaveBeenCalledWith("/api/sesion/setup", expect.anything());
  });

  it("muestra el error devuelto por la API", async () => {
    mockSetupApi(errorResponse("setup_conflict", "Ya existe una credencial", 403));
    const user = userEvent.setup();
    renderApp("/login");

    await completarFormulario(user, "secreto-largo", "secreto-largo");

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe una credencial");
    expect(
      screen.getByRole("heading", { level: 1, name: "Crea tu contraseña" }),
    ).toBeInTheDocument();
  });

  it("muestra el login normal cuando no hace falta setup", async () => {
    fetchMock.mockResolvedValue(sesionResponse(false, false));
    renderApp("/login");

    expect(await screen.findByRole("heading", { level: 1, name: "Acceso" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Confirmar contraseña")).toBeNull();
  });
});
