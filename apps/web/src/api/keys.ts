export const queryKeys = {
  buscar: ["buscar"] as const,
  sesion: ["sesion"] as const,
  objetos: ["objetos"] as const,
  arbol: ["objetos", "arbol"] as const,
  objeto: (id: string) => ["objetos", "detalle", id] as const,
  resolver: (titulo: string) => ["objetos", "resolver", titulo] as const,
  enlacesEntrantes: (id: string) => ["objetos", "detalle", id, "enlaces-entrantes"] as const,
  tipos: ["tipos"] as const,
};

export const esColeccionDeObjetos = (queryKey: readonly unknown[]): boolean => {
  if (queryKey[0] === queryKeys.buscar[0]) {
    return true;
  }
  if (queryKey[0] !== queryKeys.objetos[0]) {
    return false;
  }
  const segmento = queryKey[1];
  return segmento !== "detalle" && segmento !== "resolver";
};
