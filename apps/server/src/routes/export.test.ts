import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { bootstrapVault } from "@migite/core";
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
import { configureExport } from "./export.js";

const USUARIO = "ana";
const SECRETO = "secreto-de-test-suficientemente-largo";

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_ENTRY = 0x02014b50;
const EOCD = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

type ErrorBody = {
  readonly error: { readonly codigo: string; readonly mensaje: string };
};

const auth: AuthOptions = {
  store: createStaticSessionStore({
    usuario: USUARIO,
    passwordHash: "$argon2id$test",
    secretoSesion: SECRETO,
  }),
};

const readZip = (bytes: Uint8Array): Map<string, Buffer> => {
  const buffer = Buffer.from(bytes);
  const eocd = buffer.lastIndexOf(EOCD);
  if (eocd < 0) {
    throw new Error("firma EOCD no encontrada");
  }
  const total = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map<string, Buffer>();
  for (let index = 0; index < total; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_ENTRY) {
      throw new Error("entrada del directorio central inválida");
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (buffer.readUInt32LE(localOffset) !== LOCAL_HEADER) {
      throw new Error("cabecera local inválida");
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

let root: string;
let vaultDir: string;
let app: Hono<ServerEnv>;
let token: string;

const headers = (): Record<string, string> => ({ cookie: `${SESSION_COOKIE}=${token}` });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "migite-export-"));
  vaultDir = join(root, "vault");
  mkdirSync(vaultDir, { recursive: true });
  bootstrapVault(vaultDir);
  mkdirSync(join(vaultDir, "proyectos"), { recursive: true });
  writeFileSync(join(vaultDir, "ejemplo.md"), "# Ejemplo\n", "utf8");
  writeFileSync(join(vaultDir, "proyectos", "anidada.md"), "# Anidada\n", "utf8");
  mkdirSync(join(vaultDir, ".migite"), { recursive: true });
  writeFileSync(join(vaultDir, ".migite", "interno.md"), "# interno\n", "utf8");
  mkdirSync(join(root, "data"), { recursive: true });
  writeFileSync(join(root, "data", "index.db"), "contenido-de-la-base", "utf8");
  configureExport({ vaultDir });
  token = createSessionToken({ usuario: USUARIO, generacion: 0, secret: SECRETO });
  app = createApp({ auth });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("POST /api/export", () => {
  it("devuelve un zip con el markdown, los tipos y el README", async () => {
    const res = await app.request("/api/export", { method: "POST", headers: headers() });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="migite-export-\d{4}-\d{2}-\d{2}\.zip"$/,
    );

    const entries = readZip(new Uint8Array(await res.arrayBuffer()));
    expect([...entries.keys()]).toEqual([
      "README.txt",
      "ejemplo.md",
      "proyectos/anidada.md",
      "tipos/evento.yaml",
      "tipos/nota.yaml",
      "tipos/proyecto.yaml",
      "tipos/recordatorio.yaml",
      "tipos/tarea.yaml",
    ]);
    expect(entries.get("ejemplo.md")?.toString("utf8")).toBe("# Ejemplo\n");
    expect(entries.get("proyectos/anidada.md")?.toString("utf8")).toBe("# Anidada\n");
    const readme = entries.get("README.txt")?.toString("utf8") ?? "";
    expect(readme).toContain("Markdown");
    expect(readme).toContain("tipos/*.yaml");
  });

  it("no incluye la base de datos, el estado interno ni secretos", async () => {
    const res = await app.request("/api/export", { method: "POST", headers: headers() });
    const entries = readZip(new Uint8Array(await res.arrayBuffer()));
    const contenido = Buffer.concat([...entries.values()]).toString("utf8");

    expect(entries.has(".migite/interno.md")).toBe(false);
    expect([...entries.keys()].some((name) => name.endsWith(".db"))).toBe(false);
    expect(contenido).not.toContain("contenido-de-la-base");
    expect(contenido).not.toContain(SECRETO);
    expect(contenido).not.toContain(root);
  });

  it("exige sesión", async () => {
    const res = await app.request("/api/export", { method: "POST" });

    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrorBody).error.codigo).toBe("unauthorized");
  });
});
