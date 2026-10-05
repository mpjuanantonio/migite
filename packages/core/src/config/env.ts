import { PATRON_VARIABLE } from "./schema.js";

export interface EnvEntry {
  readonly name: string;
  readonly value: string;
  readonly line: number;
}

export interface ParsedEnv {
  readonly entries: readonly EnvEntry[];
  readonly issues: readonly string[];
}

const PATRON_PUERTO = /^\d+$/;
const ENTRECOMILLADO = /^(['"])(.*)\1$/;

export const parseDotenv = (source: string): ParsedEnv => {
  const entries: EnvEntry[] = [];
  const issues: string[] = [];
  const lineas = source.split(/\r?\n/);

  for (const [indice, linea] of lineas.entries()) {
    const numero = indice + 1;
    const texto = linea.trim();
    if (texto === "" || texto.startsWith("#")) {
      continue;
    }
    const separador = texto.indexOf("=");
    if (separador === -1) {
      issues.push(`línea ${numero}: falta «=»`);
      continue;
    }
    const name = texto.slice(0, separador).trim();
    if (!PATRON_VARIABLE.test(name)) {
      issues.push(`línea ${numero}: nombre de variable inválido`);
      continue;
    }
    const bruto = texto.slice(separador + 1).trim();
    const comillado = ENTRECOMILLADO.exec(bruto);
    entries.push({ name, value: comillado?.[2] ?? bruto, line: numero });
  }

  return { entries, issues };
};

export const problemasDeEnv = (entries: readonly EnvEntry[]): readonly string[] => {
  const puerto = entries.find((entry) => entry.name === "PORT");
  if (puerto === undefined) {
    return [];
  }
  const valor = Number(puerto.value);
  const valido =
    PATRON_PUERTO.test(puerto.value) && Number.isInteger(valor) && valor >= 1 && valor <= 65535;
  return valido ? [] : [`línea ${puerto.line}: PORT debe ser un entero entre 1 y 65535`];
};
