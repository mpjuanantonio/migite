import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ObjectPayload } from "@migite/contracts";
import { bootstrapVault, writeObjectFile } from "@migite/core";
import { buildIndex, type IndexHandle, openIndex } from "@migite/index";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { type AuthOptions, createSessionToken, SESSION_COOKIE } from "../auth.js";
import type { ServerEnv } from "../env.js";
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
  usuario: USUARIO,
  passwordHash: "$argon2id$test",
  secretoSesion: SECRETO,
  store: { generacion: () => 0, invalidar: () => 1 },
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

  it("requires a valid session", async () => {
    const res = await app.request("/api/objetos");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { codigo: "unauthorized", mensaje: "Se requiere autenticación" },
    });
  });
});

describe("GET /api/objetos/:id", () => {
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
