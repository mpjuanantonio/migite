import { type Dirent, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createExportZip,
  type ExportDeps,
  ExportLimitError,
  MAX_EXPORT_ENTRIES,
  MAX_EXPORT_FILE_BYTES,
  MAX_TOTAL_BYTES,
} from "./export.js";

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_ENTRY = 0x02014b50;
const EOCD = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

const readZipEntries = (bytes: Uint8Array): Map<string, Buffer> => {
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

const dirent = (name: string): Dirent =>
  ({ name, isDirectory: () => false, isFile: () => true }) as unknown as Dirent;

const fakeBytes = (length: number): Uint8Array => ({ length }) as unknown as Uint8Array;

let root: string;
let vaultDir: string;
let warnings: string[];

const deps = (extra: Partial<ExportDeps> = {}): ExportDeps => ({
  vaultDir,
  warn: (message) => warnings.push(message),
  ...extra,
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "migite-export-svc-"));
  vaultDir = join(root, "vault");
  mkdirSync(join(vaultDir, "tipos"), { recursive: true });
  warnings = [];
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("createExportZip", () => {
  it("omite el fichero que desaparece a mitad del recorrido y avisa", () => {
    writeFileSync(join(vaultDir, "vivo.md"), "# Vivo\n", "utf8");
    writeFileSync(join(vaultDir, "desaparece.md"), "# Fantasma\n", "utf8");
    writeFileSync(join(vaultDir, "tipos", "nota.yaml"), "id: nota\n", "utf8");

    const zip = createExportZip(
      deps({
        readFile: (path) => {
          if (path.endsWith("desaparece.md")) {
            throw new Error("ENOENT: no such file or directory");
          }
          return readFileSync(path);
        },
      }),
    );

    const entries = readZipEntries(zip);
    expect([...entries.keys()]).toEqual(["README.txt", "vivo.md", "tipos/nota.yaml"]);
    expect(entries.get("vivo.md")?.toString("utf8")).toBe("# Vivo\n");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("desaparece.md");
  });

  it("sanea los nombres de entrada y omite los inseguros", () => {
    const names = [
      "..\\..\\peligroso.md",
      "\\absoluto.md",
      "linea\nrara.md",
      "carpeta\\ok.md",
      "normal.md",
    ];
    const zip = createExportZip(
      deps({
        readDirectory: (directory) => (directory === vaultDir ? names.map(dirent) : []),
        fileSize: () => 1,
        readFile: () => new TextEncoder().encode("# x\n"),
      }),
    );

    const entries = readZipEntries(zip);
    expect([...entries.keys()]).toEqual(["README.txt", "carpeta/ok.md", "normal.md"]);
    expect(warnings).toHaveLength(3);
    expect(warnings.join(" ")).toContain("peligroso.md");
    expect(warnings.join(" ")).toContain("absoluto.md");
    expect(warnings.join(" ")).toContain("rara.md");
  });

  it("falla si el directorio raíz no se puede leer", () => {
    expect(() => createExportZip({ vaultDir: join(root, "no-existe"), warn: () => {} })).toThrow();
    expect(warnings).toHaveLength(0);
  });

  it("omite los ficheros que superan el límite por fichero", () => {
    writeFileSync(join(vaultDir, "grande.md"), "# Grande\n", "utf8");

    const zip = createExportZip(
      deps({
        fileSize: () => MAX_EXPORT_FILE_BYTES + 1,
        readFile: () => {
          throw new Error("no debería leerse");
        },
      }),
    );

    const entries = readZipEntries(zip);
    expect([...entries.keys()]).toEqual(["README.txt"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("grande.md");
  });

  it("falla con un error claro si se supera el tope de entradas", () => {
    const names = Array.from({ length: MAX_EXPORT_ENTRIES }, (_, index) => dirent(`f${index}.md`));

    let error: unknown;
    try {
      createExportZip(
        deps({
          readDirectory: (directory) => (directory === vaultDir ? names : []),
          fileSize: () => 1,
          readFile: () => new Uint8Array(1),
        }),
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ExportLimitError);
    expect((error as Error).message).toContain(String(MAX_EXPORT_ENTRIES));
  });

  it("falla con un error claro si se supera el tope de bytes", () => {
    const names = Array.from({ length: 205 }, (_, index) => dirent(`f${index}.md`));

    let error: unknown;
    try {
      createExportZip(
        deps({
          readDirectory: (directory) => (directory === vaultDir ? names : []),
          fileSize: () => MAX_EXPORT_FILE_BYTES,
          readFile: () => fakeBytes(MAX_EXPORT_FILE_BYTES),
        }),
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ExportLimitError);
    expect((error as Error).message).toContain(String(MAX_TOTAL_BYTES));
  });
});
