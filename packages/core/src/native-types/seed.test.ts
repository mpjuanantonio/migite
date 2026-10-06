import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NATIVE_TYPE_IDS, type NativeTypeId } from "./definitions.js";
import { seedNativeTypes } from "./seed.js";

const EXPECTED: Readonly<Record<NativeTypeId, string>> = {
  nota: `id: nota
nombre: Nota
descripcion: Nota plana sin atributos obligatorios
atributos: []
`,
  tarea: `id: tarea
nombre: Tarea
descripcion: Algo que hacer, con estado y fecha límite opcional
atributos:
  - id: estado
    nombre: Estado
    tipo: seleccion
    rol: estado
    obligatorio: true
    opciones: [pendiente, en curso, hecha]
    referencia_a: []
  - id: vencimiento
    nombre: Vencimiento
    tipo: fecha
    rol: vencimiento
    obligatorio: false
    opciones: []
    referencia_a: []
  - id: completada
    nombre: Completada
    tipo: fecha-hora
    obligatorio: false
    opciones: []
    referencia_a: []
`,
  recordatorio: `id: recordatorio
nombre: Recordatorio
descripcion: Aviso a una hora concreta
atributos:
  - id: hora
    nombre: Hora
    tipo: fecha-hora
    rol: hora
    obligatorio: true
    opciones: []
    referencia_a: []
  - id: estado
    nombre: Estado
    tipo: seleccion
    obligatorio: true
    opciones: [pendiente, vencido]
    referencia_a: []
`,
  evento: `id: evento
nombre: Evento
descripcion: Ocupación de una franja del calendario
atributos:
  - id: inicio
    nombre: Inicio
    tipo: fecha-hora
    rol: inicio
    obligatorio: true
    opciones: []
    referencia_a: []
  - id: fin
    nombre: Fin
    tipo: fecha-hora
    rol: fin
    obligatorio: false
    opciones: []
    referencia_a: []
  - id: todoElDia
    nombre: Todo el día
    tipo: booleano
    obligatorio: false
    opciones: []
    referencia_a: []
`,
  proyecto: `id: proyecto
nombre: Proyecto
descripcion: Agrupación de trabajo con estado
atributos:
  - id: estado
    nombre: Estado
    tipo: seleccion
    rol: estado
    obligatorio: true
    opciones: [activo, pausado, hecho, archivado]
    referencia_a: []
`,
};

const roots: string[] = [];

const createRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "migite-native-types-"));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("seedNativeTypes", () => {
  it("writes the five native types with the exact system content", () => {
    const tiposDir = join(createRoot(), "tipos");

    const result = seedNativeTypes(tiposDir);

    expect(result).toEqual({ created: [...NATIVE_TYPE_IDS], skipped: [] });
    for (const id of NATIVE_TYPE_IDS) {
      expect(readFileSync(join(tiposDir, `${id}.yaml`), "utf8"), id).toBe(EXPECTED[id]);
    }
  });

  it("creates a missing tipos directory, including its parents", () => {
    const tiposDir = join(createRoot(), "vault", "tipos", "anidado");

    const result = seedNativeTypes(tiposDir);

    expect(existsSync(tiposDir)).toBe(true);
    expect(result.created).toEqual([...NATIVE_TYPE_IDS]);
  });

  it("skips every file on a second run without touching it", () => {
    const tiposDir = join(createRoot(), "tipos");
    const first = seedNativeTypes(tiposDir);

    const second = seedNativeTypes(tiposDir);

    expect(first.created).toEqual([...NATIVE_TYPE_IDS]);
    expect(second).toEqual({ created: [], skipped: [...NATIVE_TYPE_IDS] });
    for (const id of NATIVE_TYPE_IDS) {
      expect(readFileSync(join(tiposDir, `${id}.yaml`), "utf8"), id).toBe(EXPECTED[id]);
    }
  });

  it("never overwrites a type edited by the user", () => {
    const tiposDir = join(createRoot(), "tipos");
    mkdirSync(tiposDir, { recursive: true });
    const edited = "id: nota\nnombre: Nota personalizada\natributos: []\n";
    writeFileSync(join(tiposDir, "nota.yaml"), edited, "utf8");

    const result = seedNativeTypes(tiposDir);

    expect(result.created).toEqual(["tarea", "recordatorio", "evento", "proyecto"]);
    expect(result.skipped).toEqual(["nota"]);
    expect(readFileSync(join(tiposDir, "nota.yaml"), "utf8")).toBe(edited);
  });

  it("treats a symlinked target as skipped and never writes through it", () => {
    const root = createRoot();
    const tiposDir = join(root, "tipos");
    mkdirSync(tiposDir, { recursive: true });
    const outside = join(root, "fuera.yaml");
    writeFileSync(outside, "contenido externo\n", "utf8");
    symlinkSync(outside, join(tiposDir, "nota.yaml"));

    const result = seedNativeTypes(tiposDir);

    expect(result.created).toEqual(["tarea", "recordatorio", "evento", "proyecto"]);
    expect(result.skipped).toEqual(["nota"]);
    expect(readFileSync(outside, "utf8")).toBe("contenido externo\n");
  });

  it("reports a filesystem failure with error.typeSeedFailed", () => {
    const root = createRoot();
    const blocker = join(root, "blocker");
    writeFileSync(blocker, "not a directory", "utf8");

    expect(() => seedNativeTypes(join(blocker, "tipos"))).toThrow(
      /No se pudieron sembrar los tipos nativos en .*blocker.*tipos/,
    );
  });
});
