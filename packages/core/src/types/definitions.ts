export type FieldType =
  | "text"
  | "number"
  | "date"
  | "datetime"
  | "boolean"
  | "select"
  | "multiSelect"
  | "url"
  | "reference"
  | "file";

export type AttributeRole = "status" | "due" | "start" | "end" | "time";

export const FIELD_TYPE_WIRES = {
  text: "texto",
  number: "numero",
  date: "fecha",
  datetime: "fecha-hora",
  boolean: "booleano",
  select: "seleccion",
  multiSelect: "multi-seleccion",
  url: "url",
  reference: "referencia",
  file: "archivo",
} as const satisfies Record<FieldType, string>;

export const ATTRIBUTE_ROLE_WIRES = {
  status: "estado",
  due: "vencimiento",
  start: "inicio",
  end: "fin",
  time: "hora",
} as const satisfies Record<AttributeRole, string>;

export const WIRE_TO_FIELD_TYPE = {
  texto: "text",
  numero: "number",
  fecha: "date",
  "fecha-hora": "datetime",
  booleano: "boolean",
  seleccion: "select",
  "multi-seleccion": "multiSelect",
  url: "url",
  referencia: "reference",
  archivo: "file",
} as const satisfies Record<(typeof FIELD_TYPE_WIRES)[FieldType], FieldType>;

export const WIRE_TO_ATTRIBUTE_ROLE = {
  estado: "status",
  vencimiento: "due",
  inicio: "start",
  fin: "end",
  hora: "time",
} as const satisfies Record<(typeof ATTRIBUTE_ROLE_WIRES)[AttributeRole], AttributeRole>;

const RESERVED_TYPE_IDS: readonly string[] = [
  "nota",
  "tarea",
  "recordatorio",
  "evento",
  "proyecto",
];

export const isReservedTypeId = (id: string): boolean => RESERVED_TYPE_IDS.includes(id);

export interface AttributeDefinition {
  id: string;
  name: string;
  type: FieldType;
  role?: AttributeRole;
  required: boolean;
  options?: string[];
  references?: string[];
}

export interface TypeDefinition {
  id: string;
  name: string;
  description?: string;
  attributes: AttributeDefinition[];
  system: boolean;
}

export interface TypeWarning {
  path: string;
  problems: string[];
}
