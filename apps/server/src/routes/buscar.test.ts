import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SearchResults, searchResultsSchema } from "@migite/contracts";
import { bootstrapVault, writeObjectFile } from "@migite/core";
import { buildIndex, type IndexHandle, openIndex } from "@migite/index";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { type AuthOptions, createSessionToken, SESSION_COOKIE } from "../auth.js";
import type { ServerEnv } from "../env.js";
import { encodeCursor, MAX_LIST_OFFSET } from "../services/objetos.js";
import { configureBuscar } from "./buscar.js";

const USUARIO = "ana";
const SECRETO = "secreto-de-test-suficientemente-largo";

const ALFA = "01JALFA0000000000000000000";
const BETA = "01JBETA0000000000000000000";
const GAMMA = "01JGAMMA000000000000000000";
const DELTA = "01JDELTA000000000000000000";
const EPSILON = "01JEPSILON00000000000000000";
const ZETA = "01JZETA0000000000000000000";

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
    cuerpo: "Primera nota del proyecto migite.",
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
    cuerpo: "Tarea del proyecto pendiente de revisar.",
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
    cuerpo: "Nota personal sobre el proyecto bicicleta.",
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
    cuerpo: "Recordatorio del proyecto comprar pan.",
  },
  {
    id: EPSILON,
    tipo: "tarea",
    titulo: "Épsilon",
    carpeta: "diario",
    archivo: "epsilon.md",
    creado: "2026-10-01T09:00:00.000+02:00",
    actualizado: "2026-10-01T09:00:00.000+02:00",
    etiquetas: ["trabajo"],
    atributos: { estado: "hecha" },
    cuerpo: "Proyecto de viaje a Lisboa.",
  },
  {
    id: ZETA,
    tipo: "nota",
    titulo: "Zeta",
    carpeta: "",
    archivo: "zeta.md",
    creado: "2026-09-30T09:00:00.000+02:00",
    actualizado: "2026-09-30T09:00:00.000+02:00",
    etiquetas: ["trabajo"],
    cuerpo: "Sin coincidencias de búsqueda aquí.",
  },
];

const auth: AuthOptions = {
  usuario: USUARIO,
  passwordHash: "$argon2id$test",
  secretoSesion: SECRETO,
  store: { generacion: () => 0, invalidar: () => 1 },
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
      links: [],
      attributes: { etiquetas: [...fixture.etiquetas], ...(fixture.atributos ?? {}) },
    },
    fixture.cuerpo,
  );
  writeFileSync(join(dir, fixture.archivo), text, "utf8");
};

const headers = (): Record<string, string> => ({ cookie: `${SESSION_COOKIE}=${token}` });

const getJson = async (path: string): Promise<SearchResults> => {
  const res = await app.request(path, { headers: headers() });
  expect(res.status).toBe(200);
  return searchResultsSchema.parse(await res.json());
};

const idsOf = (body: SearchResults): string[] =>
  body.resultados.map((resultado) => resultado.id).sort();

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "migite-buscar-"));
  vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  bootstrapVault(vaultDir);
  for (const fixture of FIXTURES) {
    writeFixture(fixture);
  }
  handle = openIndex({ dbPath: join(root, "index.db") });
  buildIndex(handle.db, { vaultDir });
  configureBuscar({ db: handle.db });
  token = createSessionToken({ usuario: USUARIO, generacion: 0, secret: SECRETO });
  app = createApp({ auth });
});

afterEach(() => {
  handle.close();
  rmSync(root, { recursive: true, force: true });
});

describe("GET /api/buscar", () => {
  it("searches by word prefix and returns every type with id, ruta and snippet", async () => {
    const body = await getJson("/api/buscar?q=proyect");

    expect(idsOf(body)).toEqual([ALFA, BETA, DELTA, EPSILON, GAMMA]);
    expect(new Set(body.resultados.map((resultado) => resultado.tipo))).toEqual(
      new Set(["nota", "tarea"]),
    );
    for (const resultado of body.resultados) {
      expect(resultado.id).toBeTruthy();
      expect(resultado.ruta).toMatch(/\.md$/);
      expect(resultado.fragmento?.toLowerCase()).toContain("proyect");
    }
    expect(body.siguienteCursor).toBeNull();
  });

  it("applies type, folder, tag and date filters, alone or combined", async () => {
    expect(idsOf(await getJson("/api/buscar?q=proyect&tipo=tarea"))).toEqual([BETA, EPSILON]);
    expect(idsOf(await getJson("/api/buscar?q=proyect&tag=personal"))).toEqual([DELTA, GAMMA]);
    expect(idsOf(await getJson("/api/buscar?q=proyect&carpeta=proyectos"))).toEqual([BETA, GAMMA]);
    expect(idsOf(await getJson("/api/buscar?q=proyect&tipo=nota&tag=personal"))).toEqual([
      DELTA,
      GAMMA,
    ]);
    expect(
      idsOf(
        await getJson(
          "/api/buscar?q=proyect&desde=2026-10-02T00:00:00.000Z&hasta=2026-10-03T00:00:00.000Z",
        ),
      ),
    ).toEqual([DELTA]);
  });

  it("lists filtered results by most recent update when q is missing", async () => {
    const body = await getJson("/api/buscar?tag=trabajo");

    expect(body.resultados.map((resultado) => resultado.id)).toEqual([ALFA, BETA, EPSILON, ZETA]);
    expect(body.resultados.every((resultado) => resultado.fragmento === undefined)).toBe(true);
    expect(body.siguienteCursor).toBeNull();
  });

  it("paginates with an opaque cursor without duplicates or losses", async () => {
    const expected = idsOf(await getJson("/api/buscar?q=proyect"));

    const first = await getJson("/api/buscar?q=proyect&limite=2");
    expect(first.resultados).toHaveLength(2);
    const firstCursor = first.siguienteCursor;
    expect(firstCursor).not.toBeNull();

    const second = await getJson(
      `/api/buscar?q=proyect&limite=2&cursor=${encodeURIComponent(String(firstCursor))}`,
    );
    expect(second.resultados).toHaveLength(2);
    const secondCursor = second.siguienteCursor;
    expect(secondCursor).not.toBeNull();

    const third = await getJson(
      `/api/buscar?q=proyect&limite=2&cursor=${encodeURIComponent(String(secondCursor))}`,
    );
    expect(third.resultados).toHaveLength(1);
    expect(third.siguienteCursor).toBeNull();

    const walked = [...first.resultados, ...second.resultados, ...third.resultados].map(
      (resultado) => resultado.id,
    );
    expect(walked.sort()).toEqual(expected);
    expect(new Set(walked).size).toBe(expected.length);
  });

  it("rejects invalid query params and cursors", async () => {
    const invalidLimit = await app.request("/api/buscar?limite=0", { headers: headers() });
    expect(invalidLimit.status).toBe(400);
    expect(((await invalidLimit.json()) as ErrorBody).error.codigo).toBe("validation_error");

    const invalidCursor = await app.request("/api/buscar?cursor=no-es-un-cursor", {
      headers: headers(),
    });
    expect(invalidCursor.status).toBe(400);
    expect(((await invalidCursor.json()) as ErrorBody).error.codigo).toBe("bad_request");
  });

  it("rejects cursors beyond the maximum offset and still serves the deepest allowed page", async () => {
    const beyond = await app.request(
      `/api/buscar?cursor=${encodeURIComponent(encodeCursor(MAX_LIST_OFFSET + 1))}`,
      { headers: headers() },
    );
    expect(beyond.status).toBe(400);
    expect(((await beyond.json()) as ErrorBody).error.codigo).toBe("bad_request");

    const deepest = await app.request(
      `/api/buscar?cursor=${encodeURIComponent(encodeCursor(MAX_LIST_OFFSET))}`,
      { headers: headers() },
    );
    expect(deepest.status).toBe(200);
    const body = (await deepest.json()) as SearchResults;
    expect(body.resultados).toEqual([]);
    expect(body.siguienteCursor).toBeNull();
  });

  it("requires a valid session", async () => {
    const res = await app.request("/api/buscar?q=proyect");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { codigo: "unauthorized", mensaje: "Se requiere autenticación" },
    });
  });
});
