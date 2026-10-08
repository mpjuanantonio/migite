import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ObjectPayload,
  objectPayloadSchema,
  objetosPageSchema,
  renameReportSchema,
} from "@migite/contracts";
import { bootstrapVault, writeObjectFile } from "@migite/core";
import { buildIndex, type IndexHandle, openIndex } from "@migite/index";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import {
  type AuthOptions,
  createSessionToken,
  createStaticSessionStore,
  SESSION_COOKIE,
} from "../auth.js";
import type { ServerEnv } from "../env.js";
import { encodeCursor, MAX_LIST_OFFSET } from "../services/objetos.js";
import { configureObjetos } from "./objetos.js";

const USUARIO = "ana";
const SECRETO = "secreto-de-test-suficientemente-largo";

const ALFA = "01JALFA0000000000000000000";
const BETA = "01JBETA0000000000000000000";
const GAMMA = "01JGAMMA000000000000000000";
const DELTA = "01JDELTA000000000000000000";
const EPSILON = "01JEPSILON00000000000000000";

type Fixture = {
  readonly id: string;
  readonly tipo: string;
  readonly titulo: string;
  readonly carpeta: string;
  readonly archivo: string;
  readonly creado: string;
  readonly actualizado: string;
  readonly etiquetas: readonly string[];
  readonly atributos?: Readonly<Record<string, unknown>>;
  readonly enlaces?: readonly string[];
  readonly cuerpo: string;
};

const FIXTURES: readonly Fixture[] = [
  {
    id: ALFA,
    tipo: "nota",
    titulo: "Alfa",
    carpeta: "",
    archivo: "alfa.md",
    creado: "2026-10-01T09:00:00.000+02:00",
    actualizado: "2026-10-05T09:00:00.000+02:00",
    etiquetas: ["trabajo"],
    enlaces: ["Beta"],
    cuerpo: "Primera nota sobre el proyecto migite.",
  },
  {
    id: BETA,
    tipo: "tarea",
    titulo: "Beta",
    carpeta: "proyectos",
    archivo: "beta.md",
    creado: "2026-10-01T09:00:00.000+02:00",
    actualizado: "2026-10-04T09:00:00.000+02:00",
    etiquetas: ["trabajo", "urgente"],
    atributos: { estado: "pendiente" },
    cuerpo: "Tarea pendiente de revisar el presupuesto.",
  },
  {
    id: GAMMA,
    tipo: "nota",
    titulo: "Gamma",
    carpeta: "proyectos",
    archivo: "gamma.md",
    creado: "2026-10-01T09:00:00.000+02:00",
    actualizado: "2026-10-03T09:00:00.000+02:00",
    etiquetas: ["personal"],
    cuerpo: "Nota personal sobre la bicicleta.",
  },
  {
    id: DELTA,
    tipo: "nota",
    titulo: "Delta",
    carpeta: "diario",
    archivo: "delta.md",
    creado: "2026-10-01T09:00:00.000+02:00",
    actualizado: "2026-10-02T09:00:00.000+02:00",
    etiquetas: ["personal"],
    cuerpo: "Recordatorio de comprar pan.",
  },
  {
    id: EPSILON,
    tipo: "nota",
    titulo: "Épsilon",
    carpeta: "diario",
    archivo: "epsilon.md",
    creado: "2026-10-01T09:00:00.000+02:00",
    actualizado: "2026-10-01T09:00:00.000+02:00",
    etiquetas: ["trabajo"],
    cuerpo: "Diario del viaje a Lisboa.",
  },
];

const ROTA_TEXT = `---
id: 01JROTA0000000000000000000
titulo: Rota
tipo: nota
creado: [2026
actualizado: 2026-10-06T09:00:00.000+02:00
---
Cuerpo recuperable de la nota rota.`;

const auth: AuthOptions = {
  store: createStaticSessionStore({
    usuario: USUARIO,
    passwordHash: "$argon2id$test",
    secretoSesion: SECRETO,
  }),
};

type ListBody = {
  readonly objetos: ObjectPayload[];
  readonly siguienteCursor: string | null;
};

type ErrorBody = {
  readonly error: { readonly codigo: string; readonly mensaje: string };
};

let root: string;
let vaultDir: string;
let handle: IndexHandle;
let app: Hono<ServerEnv>;
let token: string;

const writeFixture = (fixture: Fixture): void => {
  const dir = fixture.carpeta === "" ? vaultDir : join(vaultDir, fixture.carpeta);
  mkdirSync(dir, { recursive: true });
  const text = writeObjectFile(
    {
      id: fixture.id,
      type: fixture.tipo,
      title: fixture.titulo,
      created: fixture.creado,
      updated: fixture.actualizado,
      links: [...(fixture.enlaces ?? [])],
      attributes: { etiquetas: [...fixture.etiquetas], ...(fixture.atributos ?? {}) },
    },
    fixture.cuerpo,
  );
  writeFileSync(join(dir, fixture.archivo), text, "utf8");
};

const headers = (): Record<string, string> => ({ cookie: `${SESSION_COOKIE}=${token}` });

const getJson = async <T>(path: string): Promise<T> => {
  const res = await app.request(path, { headers: headers() });
  expect(res.status).toBe(200);
  return (await res.json()) as T;
};

const sendJson = async (method: string, path: string, payload: unknown): Promise<Response> =>
  app.request(path, {
    method,
    headers: { ...headers(), "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

const ENLAZA = "01JENLAZA000000000000000000";

const writeEnlaza = (): void => {
  const text = writeObjectFile(
    {
      id: ENLAZA,
      type: "nota",
      title: "Enlaza",
      created: "2026-10-01T09:00:00.000+02:00",
      updated: "2026-10-01T09:00:00.000+02:00",
      links: [],
      attributes: {},
    },
    "Enlace a [[Beta]] desde el cuerpo.",
  );
  writeFileSync(join(vaultDir, "enlaza.md"), text, "utf8");
};

const EVENTO_A = "01JEVENTOA000000000000000000";
const EVENTO_B = "01JEVENTOB000000000000000000";

const writeEvento = (id: string, titulo: string, archivo: string, inicio: string): void => {
  const text = writeObjectFile(
    {
      id,
      type: "evento",
      title: titulo,
      created: "2026-03-01T09:00:00.000+01:00",
      updated: "2026-03-01T09:00:00.000+01:00",
      links: [],
      attributes: { inicio },
    },
    "",
  );
  writeFileSync(join(vaultDir, archivo), text, "utf8");
};

const idsOf = (body: ListBody): string[] => body.objetos.map((objeto) => objeto.id);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "migite-objetos-"));
  vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  bootstrapVault(vaultDir);
  for (const fixture of FIXTURES) {
    writeFixture(fixture);
  }
  writeFileSync(join(vaultDir, "rota.md"), ROTA_TEXT, "utf8");
  handle = openIndex({ dbPath: join(root, "index.db") });
  buildIndex(handle.db, { vaultDir });
  configureObjetos({ db: handle.db, vaultDir });
  token = createSessionToken({ usuario: USUARIO, generacion: 0, secret: SECRETO });
  app = createApp({ auth });
});

afterEach(() => {
  handle.close();
  rmSync(root, { recursive: true, force: true });
});

describe("GET /api/objetos", () => {
  it("lists every indexed object ordered by most recent update", async () => {
    const body = await getJson<ListBody>("/api/objetos");

    expect(idsOf(body)).toEqual([ALFA, BETA, GAMMA, DELTA, EPSILON]);
    expect(body.siguienteCursor).toBeNull();
  });

  it("returns a page envelope validated against the shared schema", async () => {
    const res = await app.request("/api/objetos?limite=1", { headers: headers() });

    expect(res.status).toBe(200);
    const body = objetosPageSchema.parse(await res.json());
    expect(body.objetos).toHaveLength(1);
    expect(body.siguienteCursor).not.toBeNull();
  });

  it("returns complete payloads validated against the shared schema", async () => {
    const body = await getJson<ListBody>("/api/objetos?limite=1");

    expect(body.objetos).toEqual([
      {
        id: ALFA,
        tipo: "nota",
        titulo: "Alfa",
        ruta: "alfa.md",
        carpeta: "",
        creado: "2026-10-01T09:00:00.000+02:00",
        actualizado: "2026-10-05T09:00:00.000+02:00",
        atributos: { etiquetas: ["trabajo"] },
        cuerpo: "Primera nota sobre el proyecto migite.",
        enlaces: ["Beta"],
        degraded: [],
      },
    ]);
  });

  it("filters by tipo, carpeta and tag", async () => {
    expect(idsOf(await getJson<ListBody>("/api/objetos?tipo=tarea"))).toEqual([BETA]);
    expect(idsOf(await getJson<ListBody>("/api/objetos?carpeta=proyectos"))).toEqual([BETA, GAMMA]);
    expect(idsOf(await getJson<ListBody>("/api/objetos?tag=trabajo"))).toEqual([
      ALFA,
      BETA,
      EPSILON,
    ]);
    expect(idsOf(await getJson<ListBody>("/api/objetos?tipo=nota&tag=personal"))).toEqual([
      GAMMA,
      DELTA,
    ]);
  });

  it("filters by attribute equality and list membership", async () => {
    expect(idsOf(await getJson<ListBody>("/api/objetos?atributo.estado=pendiente"))).toEqual([
      BETA,
    ]);
    expect(idsOf(await getJson<ListBody>("/api/objetos?atributo.estado=en%20curso"))).toEqual([]);
    expect(idsOf(await getJson<ListBody>("/api/objetos?atributo.etiquetas=personal"))).toEqual([
      GAMMA,
      DELTA,
    ]);
    expect(
      idsOf(
        await getJson<ListBody>(
          "/api/objetos?atributo.etiquetas=trabajo&atributo.etiquetas=urgente",
        ),
      ),
    ).toEqual([ALFA, BETA, EPSILON]);
    expect(
      idsOf(await getJson<ListBody>("/api/objetos?tipo=tarea&atributo.estado=pendiente")),
    ).toEqual([BETA]);
  });

  it("filters events by attribute range with UTC normalisation", async () => {
    writeEvento(EVENTO_A, "Evento Alfa", "evento-alfa.md", "2026-03-29T01:30:00.000Z");
    writeEvento(EVENTO_B, "Evento Beta", "evento-beta.md", "2026-03-29T03:30:00.000+02:00");
    buildIndex(handle.db, { vaultDir });

    const instant = encodeURIComponent("2026-03-29T01:30:00.000Z");
    const same = await getJson<ListBody>(
      `/api/objetos?rango.inicio.desde=${instant}&rango.inicio.hasta=${instant}`,
    );
    expect(idsOf(same).sort()).toEqual([EVENTO_A, EVENTO_B].sort());

    const combined = await getJson<ListBody>(
      `/api/objetos?tipo=evento&rango.inicio.desde=${instant}&rango.inicio.hasta=${instant}`,
    );
    expect(idsOf(combined).sort()).toEqual([EVENTO_A, EVENTO_B].sort());

    const none = await getJson<ListBody>(
      `/api/objetos?rango.inicio.desde=${encodeURIComponent("2027-01-01T00:00:00.000Z")}`,
    );
    expect(idsOf(none)).toEqual([]);
  });

  it("filters by association to a destination", async () => {
    writeEnlaza();
    buildIndex(handle.db, { vaultDir });

    expect(idsOf(await getJson<ListBody>(`/api/objetos?enlazadoA=${BETA}`))).toEqual([ENLAZA]);
    expect(idsOf(await getJson<ListBody>(`/api/objetos?enlazadoA=${ALFA}`))).toEqual([]);
    expect(idsOf(await getJson<ListBody>(`/api/objetos?q=Enlace&enlazadoA=${BETA}`))).toEqual([
      ENLAZA,
    ]);
    expect(
      idsOf(await getJson<ListBody>(`/api/objetos?carpeta=proyectos&enlazadoA=${BETA}`)),
    ).toEqual([]);
  });

  it("paginates with attribute filters without duplicates or losses", async () => {
    const first = await getJson<ListBody>("/api/objetos?atributo.etiquetas=trabajo&limite=1");
    const second = await getJson<ListBody>(
      `/api/objetos?atributo.etiquetas=trabajo&limite=1&cursor=${encodeURIComponent(String(first.siguienteCursor))}`,
    );
    const third = await getJson<ListBody>(
      `/api/objetos?atributo.etiquetas=trabajo&limite=1&cursor=${encodeURIComponent(String(second.siguienteCursor))}`,
    );

    expect([...idsOf(first), ...idsOf(second), ...idsOf(third)]).toEqual([ALFA, BETA, EPSILON]);
    expect(third.siguienteCursor).toBeNull();
  });

  it("rejects malformed attribute filters with validation_error", async () => {
    const repeated = Array.from({ length: 33 }, (_, index) => `atributo.x=${index}`).join("&");
    const paths = [
      "/api/objetos?atributo.=x",
      "/api/objetos?atributo.a.b=x",
      "/api/objetos?rango.inicio=x",
      "/api/objetos?rango.inicio.desde=2026-01-01&rango.inicio.desde=2026-02-01",
      `/api/objetos?atributo.x=${"y".repeat(513)}`,
      `/api/objetos?${repeated}`,
    ];

    for (const path of paths) {
      const res = await app.request(path, { headers: headers() });
      expect(res.status).toBe(400);
      expect(((await res.json()) as ErrorBody).error.codigo).toBe("validation_error");
    }
  });

  it("searches with the q free text filter", async () => {
    expect(idsOf(await getJson<ListBody>("/api/objetos?q=bicicleta"))).toEqual([GAMMA]);
    expect(idsOf(await getJson<ListBody>("/api/objetos?q=presupuesto"))).toEqual([BETA]);
    expect(idsOf(await getJson<ListBody>("/api/objetos?q=Alfa&tipo=nota"))).toEqual([ALFA]);
  });

  it("paginates with an opaque cursor without duplicates or losses", async () => {
    const first = await getJson<ListBody>("/api/objetos?limite=2");
    const firstCursor = first.siguienteCursor;
    expect(firstCursor).not.toBeNull();

    const second = await getJson<ListBody>(
      `/api/objetos?limite=2&cursor=${encodeURIComponent(String(firstCursor))}`,
    );
    const secondCursor = second.siguienteCursor;
    expect(secondCursor).not.toBeNull();

    const third = await getJson<ListBody>(
      `/api/objetos?limite=2&cursor=${encodeURIComponent(String(secondCursor))}`,
    );

    expect(idsOf(first)).toEqual([ALFA, BETA]);
    expect(idsOf(second)).toEqual([GAMMA, DELTA]);
    expect(idsOf(third)).toEqual([EPSILON]);
    expect(third.siguienteCursor).toBeNull();
    expect([...idsOf(first), ...idsOf(second), ...idsOf(third)]).toEqual([
      ALFA,
      BETA,
      GAMMA,
      DELTA,
      EPSILON,
    ]);
  });

  it("rejects invalid query params and cursors", async () => {
    const invalidLimit = await app.request("/api/objetos?limite=0", { headers: headers() });
    expect(invalidLimit.status).toBe(400);
    expect(((await invalidLimit.json()) as ErrorBody).error.codigo).toBe("validation_error");

    const invalidCursor = await app.request("/api/objetos?cursor=no-es-un-cursor", {
      headers: headers(),
    });
    expect(invalidCursor.status).toBe(400);
    expect(((await invalidCursor.json()) as ErrorBody).error.codigo).toBe("bad_request");
  });

  it("rejects cursors beyond the maximum offset and still serves the deepest allowed page", async () => {
    const beyond = await app.request(
      `/api/objetos?cursor=${encodeURIComponent(encodeCursor(MAX_LIST_OFFSET + 1))}`,
      { headers: headers() },
    );
    expect(beyond.status).toBe(400);
    expect(((await beyond.json()) as ErrorBody).error.codigo).toBe("bad_request");

    const deepest = await app.request(
      `/api/objetos?cursor=${encodeURIComponent(encodeCursor(MAX_LIST_OFFSET))}`,
      { headers: headers() },
    );
    expect(deepest.status).toBe(200);
    const body = (await deepest.json()) as ListBody;
    expect(body.objetos).toEqual([]);
    expect(body.siguienteCursor).toBeNull();
  });

  it("requires a valid session", async () => {
    const res = await app.request("/api/objetos");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { codigo: "unauthorized", mensaje: "Se requiere autenticación" },
    });
  });
});

describe("GET /api/objetos/:id", () => {
  it("returns a payload validated against the shared schema", async () => {
    const res = await app.request(`/api/objetos/${ALFA}`, { headers: headers() });

    expect(res.status).toBe(200);
    const body = objectPayloadSchema.parse(await res.json());
    expect(body.id).toBe(ALFA);
    expect(body.titulo).toBe("Alfa");
  });

  it("reads an object by id", async () => {
    const body = await getJson<ObjectPayload>(`/api/objetos/${ALFA}`);

    expect(body.id).toBe(ALFA);
    expect(body.titulo).toBe("Alfa");
    expect(body.tipo).toBe("nota");
    expect(body.ruta).toBe("alfa.md");
    expect(body.cuerpo).toBe("Primera nota sobre el proyecto migite.");
    expect(body.degraded).toEqual([]);
  });

  it("reads an object by path and by title", async () => {
    const byPath = await getJson<ObjectPayload>(
      `/api/objetos/${encodeURIComponent("proyectos/beta.md")}`,
    );
    expect(byPath.id).toBe(BETA);
    expect(byPath.carpeta).toBe("proyectos");

    const byTitle = await getJson<ObjectPayload>(`/api/objetos/${encodeURIComponent("Épsilon")}`);
    expect(byTitle.id).toBe(EPSILON);
    expect(byTitle.carpeta).toBe("diario");
  });

  it("returns a degraded payload when the frontmatter is broken", async () => {
    const body = await getJson<ObjectPayload>("/api/objetos/rota.md");

    expect(body.titulo).toBe("Rota");
    expect(body.ruta).toBe("rota.md");
    expect(body.cuerpo).toBe("Cuerpo recuperable de la nota rota.");
    expect(body.tipo).toBe("");
    expect(body.degraded).toHaveLength(1);
    const reason = body.degraded[0];
    expect(reason?.kind).toBe("unreadableFrontmatter");
    if (reason?.kind === "unreadableFrontmatter") {
      expect(reason.problems.length).toBeGreaterThan(0);
    }
  });

  it("answers 404 with object_not_found when the object does not exist", async () => {
    const res = await app.request("/api/objetos/no-existe", { headers: headers() });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { codigo: "object_not_found", mensaje: "objeto no encontrado: no-existe" },
    });
  });

  it("requires a valid session", async () => {
    const res = await app.request(`/api/objetos/${ALFA}`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { codigo: "unauthorized", mensaje: "Se requiere autenticación" },
    });
  });
});

describe("POST /api/objetos", () => {
  it("creates an object and returns 201 with the validated payload", async () => {
    const res = await sendJson("POST", "/api/objetos", {
      titulo: "Nueva nota",
      cuerpo: "Contenido inicial",
      atributos: { etiquetas: ["api"] },
    });

    expect(res.status).toBe(201);
    const body = objectPayloadSchema.parse(await res.json());
    expect(body.titulo).toBe("Nueva nota");
    expect(body.tipo).toBe("nota");
    expect(body.ruta).toBe("nueva-nota.md");
    expect(body.carpeta).toBe("");
    expect(body.cuerpo).toBe("Contenido inicial");
    expect(body.atributos).toEqual({ etiquetas: ["api"] });
    expect(body.degraded).toEqual([]);
    expect(existsSync(join(vaultDir, body.ruta))).toBe(true);
  });

  it("rejects a missing required attribute with its domain code", async () => {
    const res = await sendJson("POST", "/api/objetos", { titulo: "Tarea", tipo: "tarea" });

    expect(res.status).toBe(422);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.codigo).toBe("missing_required_attribute");
    expect(body.error.mensaje).toContain("estado");
  });

  it("rejects an invalid attribute value with invalid_object_write", async () => {
    const res = await sendJson("POST", "/api/objetos", {
      titulo: "Tarea",
      tipo: "tarea",
      atributos: { estado: "inventado" },
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.codigo).toBe("invalid_object_write");
    expect(body.error.mensaje).toContain("estado");
  });

  it("rejects malformed bodies with validation_error", async () => {
    const res = await sendJson("POST", "/api/objetos", { titulo: "   " });

    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.codigo).toBe("validation_error");
  });
});

describe("PATCH /api/objetos/:id", () => {
  it("applies partial changes and returns the validated payload", async () => {
    const res = await sendJson("PATCH", `/api/objetos/${ALFA}`, {
      cuerpo: "Cuerpo editado",
      atributos: { etiquetas: ["trabajo", "api"] },
    });

    expect(res.status).toBe(200);
    const body = objectPayloadSchema.parse(await res.json());
    expect(body.id).toBe(ALFA);
    expect(body.titulo).toBe("Alfa");
    expect(body.tipo).toBe("nota");
    expect(body.cuerpo).toBe("Cuerpo editado");
    expect(body.atributos).toEqual({ etiquetas: ["trabajo", "api"] });
  });

  it("rejects changing the title and points to the rename endpoint", async () => {
    const res = await sendJson("PATCH", `/api/objetos/${ALFA}`, { titulo: "Otro" });

    expect(res.status).toBe(422);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.codigo).toBe("invalid_object_write");
    expect(body.error.mensaje).toContain("renombrar");
  });

  it("rejects changing tipo with a localized immutable-write error", async () => {
    const res = await sendJson("PATCH", `/api/objetos/${ALFA}`, { tipo: "tarea" });

    expect(res.status).toBe(422);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.codigo).toBe("invalid_object_write");
    expect(body.error.mensaje).toBe("el campo «tipo» es inmutable y no se puede cambiar");
  });

  it("answers object_not_found for unknown objects", async () => {
    const res = await sendJson("PATCH", "/api/objetos/no-existe", { cuerpo: "x" });

    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorBody).error.codigo).toBe("object_not_found");
  });

  it("moves the object when carpeta changes and GET reflects it", async () => {
    const res = await sendJson("PATCH", `/api/objetos/${ALFA}`, { carpeta: "archivo" });

    expect(res.status).toBe(200);
    const body = objectPayloadSchema.parse(await res.json());
    expect(body.id).toBe(ALFA);
    expect(body.carpeta).toBe("archivo");
    expect(body.ruta).toBe("archivo/alfa.md");
    expect(existsSync(join(vaultDir, "archivo", "alfa.md"))).toBe(true);
    expect(existsSync(join(vaultDir, "alfa.md"))).toBe(false);

    const read = await getJson<ObjectPayload>(`/api/objetos/${ALFA}`);
    expect(read.carpeta).toBe("archivo");
    expect(read.ruta).toBe("archivo/alfa.md");
    expect(read.cuerpo).toBe("Primera nota sobre el proyecto migite.");
  });

  it("keeps the object untouched when carpeta does not change", async () => {
    const res = await sendJson("PATCH", `/api/objetos/${BETA}`, { carpeta: "proyectos" });

    expect(res.status).toBe(200);
    const body = objectPayloadSchema.parse(await res.json());
    expect(body.ruta).toBe("proyectos/beta.md");
    expect(body.carpeta).toBe("proyectos");
    expect(body.actualizado).toBe("2026-10-04T09:00:00.000+02:00");
    expect(existsSync(join(vaultDir, "proyectos", "beta.md"))).toBe(true);
  });

  it("moves and edits the object in the same patch", async () => {
    const res = await sendJson("PATCH", `/api/objetos/${GAMMA}`, {
      carpeta: "archivo",
      cuerpo: "Nota movida.",
    });

    expect(res.status).toBe(200);
    const body = objectPayloadSchema.parse(await res.json());
    expect(body.id).toBe(GAMMA);
    expect(body.ruta).toBe("archivo/gamma.md");
    expect(body.cuerpo).toBe("Nota movida.");
    expect((await getJson<ObjectPayload>(`/api/objetos/${GAMMA}`)).cuerpo).toBe("Nota movida.");
  });

  it("rejects moving into a reserved folder with invalid_object_write", async () => {
    const res = await sendJson("PATCH", `/api/objetos/${ALFA}`, { carpeta: "tipos" });

    expect(res.status).toBe(422);
    expect(((await res.json()) as ErrorBody).error.codigo).toBe("invalid_object_write");
    expect(existsSync(join(vaultDir, "alfa.md"))).toBe(true);
  });
});

describe("DELETE /api/objetos/:id", () => {
  it("requires explicit confirmation and keeps the object", async () => {
    const res = await app.request(`/api/objetos/${ALFA}`, {
      method: "DELETE",
      headers: headers(),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.codigo).toBe("confirmation_required");
    expect(body.error.mensaje).toContain("confirmar=1");
    expect((await getJson<ObjectPayload>(`/api/objetos/${ALFA}`)).id).toBe(ALFA);
  });

  it("deletes the object with an explicit confirmation", async () => {
    const res = await app.request(`/api/objetos/${ALFA}?confirmar=1`, {
      method: "DELETE",
      headers: headers(),
    });

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(existsSync(join(vaultDir, "alfa.md"))).toBe(false);

    const gone = await app.request(`/api/objetos/${ALFA}`, { headers: headers() });
    expect(gone.status).toBe(404);
    expect(((await gone.json()) as ErrorBody).error.codigo).toBe("object_not_found");
  });
});

describe("POST /api/objetos/:id/renombrar", () => {
  it("renames the object, rewrites backlinks and reports the outcome", async () => {
    writeEnlaza();

    const res = await sendJson("POST", `/api/objetos/${BETA}/renombrar`, {
      nuevoTitulo: "Beta Nueva",
    });

    expect(res.status).toBe(200);
    const body = renameReportSchema.parse(await res.json());
    expect(body.objeto.id).toBe(BETA);
    expect(body.objeto.titulo).toBe("Beta Nueva");
    expect(body.objeto.ruta).toBe("proyectos/beta-nueva.md");
    expect(body.informe.reescritos).toContain("enlaza.md");
    expect(body.informe.omitidos).toEqual([]);
    expect(body.informe.enlacesSinResolver).toEqual([]);
    expect(readFileSync(join(vaultDir, "enlaza.md"), "utf8")).toContain("[[Beta Nueva]]");
  });

  it("rejects a duplicated title with ambiguous_title", async () => {
    const res = await sendJson("POST", `/api/objetos/${GAMMA}/renombrar`, {
      nuevoTitulo: "Alfa",
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.codigo).toBe("ambiguous_title");
    expect(body.error.mensaje).toContain("Alfa");
  });
});

describe("sesión requerida en escrituras", () => {
  it("rejects POST, PATCH, DELETE and rename without a session cookie", async () => {
    const cases = [
      ["POST", "/api/objetos"],
      ["PATCH", `/api/objetos/${ALFA}`],
      ["DELETE", `/api/objetos/${ALFA}?confirmar=1`],
      ["POST", `/api/objetos/${ALFA}/renombrar`],
    ] as const;

    for (const [method, path] of cases) {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
      expect(((await res.json()) as ErrorBody).error.codigo).toBe("unauthorized");
    }
  });
});
