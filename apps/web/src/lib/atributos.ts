import type { AttributePayload, FieldTypeWire } from "@migite/contracts";

const WIKILINK = /^\[\[([^[\]]+)\]\]$/;

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

export const esVacio = (valor: unknown): valor is null | undefined =>
  valor === undefined || valor === null;

export const filtrarVacios = (
  atributos: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const resultado: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(atributos)) {
    if (!esVacio(valor)) {
      resultado[clave] = valor;
    }
  }
  return resultado;
};

export const iguales = (izquierda: unknown, derecha: unknown): boolean => {
  if (Object.is(izquierda, derecha)) {
    return true;
  }
  if (Array.isArray(izquierda) && Array.isArray(derecha)) {
    return (
      izquierda.length === derecha.length &&
      izquierda.every((item, indice) => iguales(item, derecha[indice]))
    );
  }
  if (esObjeto(izquierda) && esObjeto(derecha)) {
    const claves = Object.keys(izquierda);
    return (
      claves.length === Object.keys(derecha).length &&
      claves.every(
        (clave) => Object.hasOwn(derecha, clave) && iguales(izquierda[clave], derecha[clave]),
      )
    );
  }
  return false;
};

const relleno = (numero: number): string => String(numero).padStart(2, "0");

const fechaHoraATexto = (valor: unknown): string => {
  if (typeof valor !== "string") {
    return "";
  }
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    return valor;
  }
  return (
    `${fecha.getFullYear()}-${relleno(fecha.getMonth() + 1)}-${relleno(fecha.getDate())}` +
    `T${relleno(fecha.getHours())}:${relleno(fecha.getMinutes())}`
  );
};

const textoAFechaHora = (texto: string): string => {
  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? texto : fecha.toISOString();
};

const desenvolver = (valor: string): string => {
  const coincidencia = WIKILINK.exec(valor.trim());
  return coincidencia?.[1] ?? valor.trim();
};

const aTextoReferencia = (valor: unknown): string => {
  if (Array.isArray(valor)) {
    return valor
      .map((item) => (typeof item === "string" ? desenvolver(item) : String(item)))
      .join(", ");
  }
  return typeof valor === "string" ? valor : "";
};

export const aTexto = (tipo: FieldTypeWire | undefined, valor: unknown): string => {
  if (esVacio(valor)) {
    return "";
  }
  switch (tipo) {
    case "fecha-hora":
      return fechaHoraATexto(valor);
    case "referencia":
      return aTextoReferencia(valor);
    case "multi-seleccion":
      return Array.isArray(valor) ? valor.map((item) => String(item)).join(", ") : String(valor);
    default:
      if (typeof valor === "string") {
        return valor;
      }
      if (typeof valor === "object") {
        return JSON.stringify(valor);
      }
      return String(valor);
  }
};

export const aTextoCrudo = (valor: unknown): string => {
  if (esVacio(valor)) {
    return "";
  }
  return typeof valor === "string" ? valor : JSON.stringify(valor);
};

export const parsearCrudo = (texto: string): unknown => {
  const limpio = texto.trim();
  if (limpio === "") {
    return "";
  }
  try {
    return JSON.parse(limpio) as unknown;
  } catch {
    return texto;
  }
};

export const aWire = (tipo: FieldTypeWire | undefined, bruto: unknown): unknown => {
  switch (tipo) {
    case "booleano":
      return bruto === true;
    case "numero": {
      if (typeof bruto === "number") {
        return Number.isFinite(bruto) ? bruto : null;
      }
      const texto = String(bruto ?? "").trim();
      if (texto === "") {
        return null;
      }
      const numero = Number(texto);
      return Number.isFinite(numero) ? numero : texto;
    }
    case "fecha": {
      const texto = String(bruto ?? "").trim();
      return texto === "" ? null : texto;
    }
    case "fecha-hora": {
      const texto = String(bruto ?? "").trim();
      return texto === "" ? null : textoAFechaHora(texto);
    }
    case "seleccion": {
      const texto = String(bruto ?? "");
      return texto === "" ? null : texto;
    }
    case "multi-seleccion": {
      return Array.isArray(bruto)
        ? bruto.filter((item): item is string => typeof item === "string")
        : String(bruto ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item !== "");
    }
    case "referencia": {
      if (Array.isArray(bruto)) {
        return bruto.filter((item): item is string => typeof item === "string");
      }
      const texto = String(bruto ?? "").trim();
      if (texto === "") {
        return null;
      }
      const enlaces = texto
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item !== "")
        .map((item) => (WIKILINK.test(item) ? item : `[[${item}]]`));
      return enlaces.length === 1 ? enlaces[0] : enlaces;
    }
    case "url": {
      const texto = String(bruto ?? "").trim();
      return texto === "" ? null : texto;
    }
    case "archivo": {
      const texto = String(bruto ?? "").trim();
      return texto === "" ? null : texto;
    }
    default:
      return typeof bruto === "string" ? bruto : bruto === undefined ? "" : bruto;
  }
};

export type FilaAtributo = {
  readonly clave: string;
  readonly valor: unknown;
  readonly definicion: AttributePayload | undefined;
};

export type BorradorAtributos = {
  readonly objetoId: string;
  readonly valores: Readonly<Record<string, unknown>>;
  readonly eliminados: readonly string[];
};

export const esObligatorio = (definicion: AttributePayload | undefined): boolean =>
  definicion?.obligatorio === true;

export const construirAtributos = (
  objeto: { readonly id: string; readonly atributos: Readonly<Record<string, unknown>> },
  borrador: BorradorAtributos | undefined,
  definiciones: ReadonlyMap<string, AttributePayload>,
): Record<string, unknown> => {
  const vigente =
    borrador !== undefined && borrador.objetoId === objeto.id
      ? borrador
      : { objetoId: objeto.id, valores: {}, eliminados: [] };
  const base = filtrarVacios(objeto.atributos);
  const resultado: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(base)) {
    if (vigente.eliminados.includes(clave) && !esObligatorio(definiciones.get(clave))) {
      continue;
    }
    resultado[clave] = valor;
  }
  for (const [clave, valor] of Object.entries(vigente.valores)) {
    if (vigente.eliminados.includes(clave)) {
      continue;
    }
    const definicion = definiciones.get(clave);
    resultado[clave] =
      definicion === undefined ? parsearCrudo(String(valor ?? "")) : aWire(definicion.tipo, valor);
  }
  for (const clave of vigente.eliminados) {
    if (esObligatorio(definiciones.get(clave)) || !Object.hasOwn(base, clave)) {
      continue;
    }
    resultado[clave] = null;
  }
  return resultado;
};
