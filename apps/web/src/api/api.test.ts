import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, setUnauthorizedHandler } from "./api";

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("apiFetch", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    setUnauthorizedHandler(undefined);
    vi.unstubAllGlobals();
  });

  it("envía cookies y devuelve el JSON de una respuesta 200", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ autenticado: true }, 200));

    const result = await apiFetch<{ readonly autenticado: boolean }>("/api/sesion");

    expect(result).toEqual({ autenticado: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sesion",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("serializa el cuerpo y pide JSON en las peticiones con datos", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "01J" }, 201));

    await apiFetch("/api/objetos", { method: "POST", body: { titulo: "Hola" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/objetos",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ titulo: "Hola" }),
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });

  it("convierte el contrato de error en ApiError", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { codigo: "validation_error", mensaje: "Los datos no son válidos" } },
        400,
      ),
    );

    const error = await apiFetch("/api/objetos").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      codigo: "validation_error",
      mensaje: "Los datos no son válidos",
      status: 400,
    });
  });

  it("usa un error genérico cuando el cuerpo no sigue el contrato", async () => {
    fetchMock.mockResolvedValue(new Response("texto plano", { status: 500 }));

    const error = await apiFetch("/api/objetos").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ codigo: "generic_error", status: 500 });
  });

  it("avisa al manejador y lanza ApiError cuando la respuesta es 401", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { codigo: "unauthorized", mensaje: "Se requiere autenticación" } },
        401,
      ),
    );

    const error = await apiFetch("/api/objetos").catch((caught: unknown) => caught);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({ codigo: "unauthorized", status: 401 });
  });

  it("devuelve undefined en una respuesta 204", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiFetch("/api/objetos/01J", { method: "DELETE" })).resolves.toBeUndefined();
  });
});
