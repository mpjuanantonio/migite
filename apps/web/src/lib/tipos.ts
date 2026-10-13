import type {
  AttributePayload,
  FieldTypeWire,
  PresentacionPayload,
  PresentacionSeccion,
  TipoPayload,
} from "@migite/contracts";
import { isReservedTypeId, slugify } from "@migite/core";

export const FIELD_TYPES: readonly FieldTypeWire[] = [
  "texto",
  "numero",
  "fecha",
  "fecha-hora",
  "booleano",
  "seleccion",
  "multi-seleccion",
  "url",
  "referencia",
  "archivo",
];

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export const esTipoSistema = (id: string): boolean => isReservedTypeId(id);

export const sugerirId = (nombre: string): string => slugify(nombre);

export const idValido = (id: string): boolean => ID_PATTERN.test(id.trim());

export const esTipoConOpciones = (tipo: FieldTypeWire): boolean =>
  tipo === "seleccion" || tipo === "multi-seleccion";

export const parsearOpciones = (texto: string): string[] =>
  texto
    .split(",")
    .map((opcion) => opcion.trim())
    .filter((opcion) => opcion !== "");

export const formatearOpciones = (opciones: readonly string[] | undefined): string =>
  (opciones ?? []).join(", ");

export type AtributoBorrador = {
  readonly clave: string;
  readonly original: AttributePayload | undefined;
  readonly id: string;
  readonly idManual: boolean;
  readonly nombre: string;
  readonly tipo: FieldTypeWire;
  readonly obligatorio: boolean;
  readonly opciones: string;
};

export const nuevoAtributo = (clave: string): AtributoBorrador => ({
  clave,
  original: undefined,
  id: "",
  idManual: false,
  nombre: "",
  tipo: "texto",
  obligatorio: false,
  opciones: "",
});

export const borradoresDe = (tipo: TipoPayload | undefined): AtributoBorrador[] =>
  (tipo?.atributos ?? []).map((atributo, indice) => ({
    clave: `existente-${indice}-${atributo.id}`,
    original: atributo,
    id: atributo.id,
    idManual: true,
    nombre: atributo.nombre,
    tipo: atributo.tipo,
    obligatorio: atributo.obligatorio,
    opciones: formatearOpciones(atributo.opciones),
  }));

export const atributoValido = (borrador: AtributoBorrador): boolean =>
  idValido(borrador.id) && borrador.nombre.trim() !== "";

export const hayIdsDuplicados = (borradores: readonly AtributoBorrador[]): boolean => {
  const ids = borradores.map((borrador) => borrador.id.trim());
  return new Set(ids).size !== ids.length;
};

export type PresentacionBorrador = {
  readonly seccion: "" | PresentacionSeccion;
  readonly carpeta: string;
  readonly visible: boolean;
};

export const presentacionInicial = (tipo: TipoPayload | undefined): PresentacionBorrador => ({
  seccion: tipo?.presentacion?.seccion ?? "",
  carpeta: tipo?.presentacion?.carpeta ?? "",
  visible: tipo?.presentacion?.visible ?? true,
});

export const payloadDePresentacion = (borrador: PresentacionBorrador): PresentacionPayload => {
  const carpeta = borrador.carpeta.trim();
  return {
    ...(borrador.seccion === "" ? {} : { seccion: borrador.seccion }),
    ...(carpeta === "" ? {} : { carpeta }),
    visible: borrador.visible,
  };
};

export const payloadDeAtributo = (borrador: AtributoBorrador): AttributePayload => {
  const original = borrador.original;
  const opciones = esTipoConOpciones(borrador.tipo) ? parsearOpciones(borrador.opciones) : [];
  return {
    id: borrador.id.trim(),
    nombre: borrador.nombre.trim(),
    tipo: borrador.tipo,
    ...(original?.rol === undefined ? {} : { rol: original.rol }),
    obligatorio: borrador.obligatorio,
    ...(opciones.length === 0 ? {} : { opciones }),
    ...(borrador.tipo === "referencia" && original?.referencia_a !== undefined
      ? { referencia_a: [...original.referencia_a] }
      : {}),
  };
};
