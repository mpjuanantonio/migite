import { createObjectBodySchema, type ErrorBody, errorBodySchema } from "@migite/contracts";
import { ConfigError, ObjectOperationError } from "@migite/core";
import { IndexError } from "@migite/index";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { ServerEnv } from "../env.js";
import { registerErrorHandling } from "./errors.js";
import { requestLogger } from "./logs.js";

const testApp = (): Hono<ServerEnv> => {
  const app = new Hono<ServerEnv>();
  app.use("*", requestLogger);
  registerErrorHandling(app);
  return app;
};

const errorFrom = async (res: Response): Promise<ErrorBody> =>
  errorBodySchema.parse(await res.json());

const logEntries = (): readonly Record<string, unknown>[] =>
  vi
    .mocked(console.log)
    .mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("registerErrorHandling", () => {
  it("answers unknown routes with a not_found ErrorBody", async () => {
    const res = await createApp().request("/api/desconocido");

    expect(res.status).toBe(404);
    const body = await errorFrom(res);
    expect(body.error.codigo).toBe("not_found");
    expect(body.error.mensaje.length).toBeGreaterThan(0);
  });

  it("maps zod validation failures to validation_error without leaking values", async () => {
    const app = testApp();
    app.post("/objetos", async (c) => {
      const body = createObjectBodySchema.parse(await c.req.json());
      return c.json(body);
    });

    const res = await app.request("/objetos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ titulo: "", secreto: "valor-sensible-xyz" }),
    });
    const raw = await res.text();

    expect(res.status).toBe(400);
    expect(raw).not.toContain("valor-sensible-xyz");
    const body = errorBodySchema.parse(JSON.parse(raw) as unknown);
    expect(body.error.codigo).toBe("validation_error");
    expect(body.error.mensaje).toContain("titulo");
  });

  it("returns internal_error without details and logs the full error", async () => {
    const app = testApp();
    app.get("/boom", () => {
      throw new Error("secreto interno en /var/lib/migite");
    });

    const res = await app.request("/boom");
    const raw = await res.text();

    expect(res.status).toBe(500);
    expect(raw).not.toContain("secreto interno");
    expect(raw).not.toContain("/var/lib/migite");
    const body = errorBodySchema.parse(JSON.parse(raw) as unknown);
    expect(body.error.codigo).toBe("internal_error");

    const errorEntry = logEntries().find((entry) => entry.event === "error");
    expect(errorEntry?.codigo).toBe("internal_error");
    expect(String(errorEntry?.mensaje)).toContain("secreto interno");
    expect(String(errorEntry?.stack)).toContain("errors.test.ts");
  });

  it("correlates the error log with the request log", async () => {
    const app = testApp();
    app.get("/boom", () => {
      throw new Error("fallo");
    });

    await app.request("/boom");

    const entries = logEntries();
    const errorEntry = entries.find((entry) => entry.event === "error");
    const requestEntry = entries.find((entry) => entry.event === "request");
    expect(errorEntry?.requestId).toBe(requestEntry?.requestId);
    expect(requestEntry?.status).toBe(500);
  });

  it("localizes domain errors from Accept-Language", async () => {
    const app = testApp();
    app.get("/objeto", () => {
      throw new ObjectOperationError("error.objectNotFound", { id: "abc" });
    });

    const fallback = await app.request("/objeto");
    expect((await errorFrom(fallback)).error.mensaje).toBe("objeto no encontrado: abc");

    const spanish = await app.request("/objeto", { headers: { "accept-language": "es-ES" } });
    expect((await errorFrom(spanish)).error.mensaje).toBe("objeto no encontrado: abc");

    const english = await app.request("/objeto", {
      headers: { "accept-language": "en-US,en;q=0.9" },
    });
    const body = await errorFrom(english);
    expect(body.error.codigo).toBe("object_not_found");
    expect(body.error.mensaje).toBe("object not found: abc");

    const unknown = await app.request("/objeto", { headers: { "accept-language": "fr" } });
    expect((await errorFrom(unknown)).error.mensaje).toBe("objeto no encontrado: abc");
  });

  it("uses the configured locale when the header is absent", async () => {
    const app = createApp({ locale: "en" });
    app.get("/api/objeto", () => {
      throw new ObjectOperationError("error.objectNotFound", { id: "abc" });
    });

    const body = await errorFrom(await app.request("/api/objeto"));
    expect(body.error.mensaje).toBe("object not found: abc");
  });

  it("maps ambiguous titles to a conflict", async () => {
    const app = testApp();
    app.get("/ambiguo", () => {
      throw new ObjectOperationError("error.ambiguousTitle", { title: "nota" });
    });

    const res = await app.request("/ambiguo");
    expect(res.status).toBe(409);
    const body = await errorFrom(res);
    expect(body.error.codigo).toBe("ambiguous_title");
  });

  it("maps ConfigError and IndexError to stable codes", async () => {
    const app = testApp();
    app.get("/config", () => {
      throw new ConfigError("config/app.yaml", ["port inválido"]);
    });
    app.get("/indice", () => {
      throw new IndexError("índice roto");
    });

    expect((await errorFrom(await app.request("/config"))).error.codigo).toBe("config_error");
    expect((await errorFrom(await app.request("/indice"))).error.codigo).toBe("index_error");
  });

  it("maps Hono HTTPException statuses", async () => {
    const app = testApp();
    app.get("/privado", () => {
      throw new HTTPException(401);
    });

    const res = await app.request("/privado");
    expect(res.status).toBe(401);
    const body = await errorFrom(res);
    expect(body.error.codigo).toBe("unauthorized");
  });
});
