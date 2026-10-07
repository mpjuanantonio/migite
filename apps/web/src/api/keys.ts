export const queryKeys = {
  sesion: ["sesion"] as const,
  objetos: ["objetos"] as const,
  objeto: (id: string) => ["objetos", id] as const,
};
