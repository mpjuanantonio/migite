import { createObjectBodySchema, type ErrorBody, errorBodySchema } from "@migite/contracts";
import { ConfigError, ObjectOperationError, TypeOperationError } from "@migite/core";
import { IndexError } from "@migite/index";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { type AuthOptions, createSessionToken, SESSION_COOKIE } from "../auth.js";
import type { ServerEnv } from "../env.js";
import { registerErrorHandling } from "./errors.js";
import { requestLogger } from "./logs.js";

const testAuth: AuthOptions = {
  usuario: "tester",
  passwordHash: "$argon2id$test",
  secretoSesion: "secreto-de-test-suficientemente-largo",
  store: { generacion: () => 0, invalidar: () => 1 },
};

const sessionHeaders = (): Record<string, string> => ({
  cookie: `${SESSION_COOKIE}=${createSessionToken({
    usuario: testAuth.usuario,
    generacion: 0,
    secret: testAuth.secretoSesion,
  })}`,
});

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
  it("answers unknown routes with a localized not_found ErrorBody", async () => {
    const res = await createApp({ auth: testAuth }).request("/api/desconocido", {
      headers: { ...sessionHeaders(), "accept-language": "en" },
    });

    expect(res.status).toBe(404);
    const body = await errorFrom(res);
    expect(body.error.codigo).toBe("not_found");
    expect(body.error.mensaje).toBe("The requested resource was not found");
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

    const res = await app.request("/boom", { headers: { "accept-language": "en" } });
    const raw = await res.text();

    expect(res.status).toBe(500);
    expect(raw).not.toContain("secreto interno");
    expect(raw).not.toContain("/var/lib/migite");
    const body = errorBodySchema.parse(JSON.parse(raw) as unknown);
    expect(body.error.codigo).toBe("internal_error");
    expect(body.error.mensaje).toBe("An internal server error occurred");

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
    const app = createApp({ locale: "en", auth: testAuth });
    app.get("/api/objeto", () => {
      throw new ObjectOperationError("error.objectNotFound", { id: "abc" });
    });

    const body = await errorFrom(await app.request("/api/objeto", { headers: sessionHeaders() }));
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

  it("maps TypeOperationError to stable type codes with localized messages", async () => {
    const app = testApp();
    app.get("/tipo/reservado", () => {
      throw new TypeOperationError("error.typeNotEditable", { id: "nota" });
    });
    app.get("/tipo/inmutable", () => {
      throw new TypeOperationError("error.attributeTypeImmutable", { id: "titulo" });
    });
    app.get("/tipo/duplicado", () => {
      throw new TypeOperationError("error.typeAlreadyExists", { id: "libro" });
    });
    app.get("/tipo/ausente", () => {
      throw new TypeOperationError("error.notFound", { id: "fantasma" });
    });

    const cases = [
      {
        path: "/tipo/reservado",
        status: 403,
        codigo: "type_not_editable",
        mensaje: "el tipo «nota» es nativo y no se puede editar",
      },
      {
        path: "/tipo/inmutable",
        status: 422,
        codigo: "attribute_type_immutable",
        mensaje: "no se puede cambiar el tipo del atributo «titulo»",
      },
      {
        path: "/tipo/duplicado",
        status: 409,
        codigo: "type_already_exists",
        mensaje: "ya existe un tipo con id «libro»",
      },
      {
        path: "/tipo/ausente",
        status: 404,
        codigo: "type_not_found",
        mensaje: "El recurso solicitado no existe",
      },
    ] as const;

    for (const { path, status, codigo, mensaje } of cases) {
      const res = await app.request(path);
      expect(res.status).toBe(status);
      const body = await errorFrom(res);
      expect(body.error.codigo).toBe(codigo);
      expect(body.error.mensaje).toBe(mensaje);
    }

    const english = await app.request("/tipo/reservado", {
      headers: { "accept-language": "en" },
    });
    expect((await errorFrom(english)).error.mensaje).toBe(
      'type "nota" is native and cannot be edited',
    );
  });

  it("appends TypeOperationError problems to the message and the log", async () => {
    const app = testApp();
    app.get("/tipo/invalido", () => {
      throw new TypeOperationError("error.validationError", {}, [
        'attribute "titulo": missing required field "nombre"',
      ]);
    });

    const res = await app.request("/tipo/invalido", { headers: { "accept-language": "en" } });

    expect(res.status).toBe(400);
    const body = await errorFrom(res);
    expect(body.error.codigo).toBe("validation_error");
    expect(body.error.mensaje).toContain("The data provided is not valid");
    expect(body.error.mensaje).toContain('missing required field "nombre"');

    const errorEntry = logEntries().find((entry) => entry.event === "error");
    expect(String(errorEntry?.mensaje)).toContain('missing required field "nombre"');
  });

  it("does not duplicate problems already present in the localized message", async () => {
    const app = testApp();
    app.get("/objeto/invalido", () => {
      throw new ObjectOperationError("error.invalidObjectWrite", { problems: "bad folder" }, [
        "bad folder",
      ]);
    });

    const body = await errorFrom(await app.request("/objeto/invalido"));
    expect(body.error.mensaje).toContain("bad folder");
    expect(body.error.mensaje.match(/bad folder/g)).toHaveLength(1);
  });

  it("maps HTTP 429 to rate_limited", async () => {
    const app = testApp();
    app.get("/limitado", () => {
      throw new HTTPException(429);
    });

    const res = await app.request("/limitado", { headers: { "accept-language": "en" } });

    expect(res.status).toBe(429);
    const body = await errorFrom(res);
    expect(body.error.codigo).toBe("rate_limited");
    expect(body.error.mensaje).toBe("Too many attempts. Try again later");
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

  it("maps Hono HTTPException statuses with their own localized message", async () => {
    const app = testApp();
    app.get("/privado", () => {
      throw new HTTPException(401);
    });

    const res = await app.request("/privado", { headers: { "accept-language": "en" } });
    expect(res.status).toBe(401);
    const body = await errorFrom(res);
    expect(body.error.codigo).toBe("unauthorized");
    expect(body.error.mensaje).toBe("Authentication is required");
  });

  it("localizes every generic error code from Accept-Language", async () => {
    const app = testApp();
    app.get("/error/:status", (c) => {
      const status = Number(c.req.param("status")) as 400 | 401 | 403 | 404 | 409 | 422 | 500;
      throw new HTTPException(status);
    });
    app.get("/indice", () => {
      throw new IndexError("índice roto");
    });

    const cases = [
      { path: "/error/400", codigo: "bad_request", mensaje: "The request is invalid" },
      { path: "/error/401", codigo: "unauthorized", mensaje: "Authentication is required" },
      {
        path: "/error/403",
        codigo: "forbidden",
        mensaje: "You do not have permission to perform this action",
      },
      {
        path: "/error/404",
        codigo: "not_found",
        mensaje: "The requested resource was not found",
      },
      {
        path: "/error/409",
        codigo: "conflict",
        mensaje: "The request conflicts with the current state",
      },
      {
        path: "/error/422",
        codigo: "validation_error",
        mensaje: "The data provided is not valid",
      },
      {
        path: "/error/500",
        codigo: "internal_error",
        mensaje: "An internal server error occurred",
      },
      {
        path: "/indice",
        codigo: "index_error",
        mensaje: "The search index is unavailable",
      },
    ] as const;

    for (const { path, codigo, mensaje } of cases) {
      const res = await app.request(path, { headers: { "accept-language": "en" } });
      const body = await errorFrom(res);
      expect(body.error.codigo).toBe(codigo);
      expect(body.error.mensaje).toBe(mensaje);
    }
  });
});
