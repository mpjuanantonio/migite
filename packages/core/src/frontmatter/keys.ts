export const RESERVED_KEYS = ["id", "tipo", "titulo", "creado", "actualizado", "enlaces"] as const;

export type ReservedKey = (typeof RESERVED_KEYS)[number];

export const REQUIRED_KEYS = ["id", "titulo", "creado", "actualizado"] as const;

export const DEFAULT_TYPE = "nota";

export const isReservedKey = (key: string): key is ReservedKey =>
  (RESERVED_KEYS as readonly string[]).includes(key);
