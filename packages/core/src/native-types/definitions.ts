export const NATIVE_TYPE_IDS = ["nota", "tarea", "recordatorio", "evento", "proyecto"] as const;

export type NativeTypeId = (typeof NATIVE_TYPE_IDS)[number];

export const NATIVE_TYPE_YAML: Readonly<Record<NativeTypeId, string>> = {
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
