export const queryKeys = {
  buscar: ["buscar"] as const,
  sesion: ["sesion"] as const,
  objetos: ["objetos"] as const,
  objeto: (id: string) => ["objetos", id] as const,
  resolver: (titulo: string) => ["objetos", "resolver", titulo] as const,
  enlacesEntrantes: (id: string) => ["objetos", id, "enlaces-entrantes"] as const,
  tipos: ["tipos"] as const,
};
