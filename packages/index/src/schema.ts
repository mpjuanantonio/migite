import {
  blob,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const LINK_CONTEXTS = ["cuerpo", "frontmatter"] as const;

export type LinkContext = (typeof LINK_CONTEXTS)[number];

export const objetos = sqliteTable(
  "objetos",
  {
    id: text("id").primaryKey(),
    tipoId: text("tipo_id").notNull(),
    titulo: text("titulo").notNull(),
    ruta: text("ruta").notNull(),
    hash: text("hash").notNull(),
    creado: text("creado").notNull(),
    actualizado: text("actualizado").notNull(),
  },
  (table) => [
    index("objetos_tipo_id_idx").on(table.tipoId),
    uniqueIndex("objetos_ruta_unique").on(table.ruta),
  ],
);

export const atributos = sqliteTable(
  "atributos",
  {
    objetoId: text("objeto_id")
      .notNull()
      .references(() => objetos.id, { onDelete: "cascade" }),
    clave: text("clave").notNull(),
    valorTexto: text("valor_texto"),
    valorNumero: real("valor_numero"),
    valorFecha: text("valor_fecha"),
  },
  (table) => [
    index("atributos_objeto_id_idx").on(table.objetoId),
    index("atributos_clave_valor_texto_idx").on(table.clave, table.valorTexto),
  ],
);

export const enlaces = sqliteTable(
  "enlaces",
  {
    origenId: text("origen_id")
      .notNull()
      .references(() => objetos.id, { onDelete: "cascade" }),
    destinoId: text("destino_id")
      .notNull()
      .references(() => objetos.id, { onDelete: "cascade" }),
    contexto: text("contexto", { enum: LINK_CONTEXTS }).notNull(),
  },
  (table) => [
    index("enlaces_origen_id_idx").on(table.origenId),
    index("enlaces_destino_id_idx").on(table.destinoId),
  ],
);

export const fragmentos = sqliteTable(
  "fragmentos",
  {
    id: text("id").primaryKey(),
    objetoId: text("objeto_id")
      .notNull()
      .references(() => objetos.id, { onDelete: "cascade" }),
    encabezado: text("encabezado"),
    texto: text("texto").notNull(),
    orden: integer("orden").notNull(),
  },
  (table) => [index("fragmentos_objeto_id_idx").on(table.objetoId)],
);

export const embeddings = sqliteTable(
  "embeddings",
  {
    fragmentoId: text("fragmento_id")
      .notNull()
      .references(() => fragmentos.id, { onDelete: "cascade" }),
    modelo: text("modelo").notNull(),
    vector: blob("vector").notNull(),
  },
  (table) => [primaryKey({ columns: [table.fragmentoId, table.modelo] })],
);

export const acciones = sqliteTable(
  "acciones",
  {
    id: text("id").primaryKey(),
    tipoAccion: text("tipo_accion").notNull(),
    payload: text("payload").notNull(),
    estado: text("estado").notNull(),
    creada: text("creada").notNull(),
  },
  (table) => [index("acciones_estado_idx").on(table.estado)],
);

export const conversaciones = sqliteTable("conversaciones", {
  id: text("id").primaryKey(),
  titulo: text("titulo"),
  creada: text("creada").notNull(),
});

export const mensajes = sqliteTable(
  "mensajes",
  {
    id: text("id").primaryKey(),
    conversacionId: text("conversacion_id")
      .notNull()
      .references(() => conversaciones.id, { onDelete: "cascade" }),
    rol: text("rol").notNull(),
    contenido: text("contenido").notNull(),
    creada: text("creada").notNull(),
  },
  (table) => [index("mensajes_conversacion_id_idx").on(table.conversacionId)],
);

export const meta = sqliteTable("meta", {
  clave: text("clave").primaryKey(),
  valor: text("valor").notNull(),
});
