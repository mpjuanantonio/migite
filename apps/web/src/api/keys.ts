export const queryKeys = {
  buscar: ["buscar"] as const,
  sesion: ["sesion"] as const,
  objetos: ["objetos"] as const,
  objeto: (id: string) => ["objetos", id] as const,
  tipos: ["tipos"] as const,
};
