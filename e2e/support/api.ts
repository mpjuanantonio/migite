import { expect, type Page } from "@playwright/test";

export type ObjetoApi = {
  readonly id: string;
  readonly titulo: string;
  readonly tipo: string;
  readonly atributos: Readonly<Record<string, unknown>>;
};

export type CuerpoObjeto = {
  readonly tipo: string;
  readonly titulo: string;
  readonly cuerpo?: string;
  readonly atributos?: Readonly<Record<string, unknown>>;
};

const LIMITE_LISTA = 100;

const MAX_PASADAS_LIMPIEZA = 20;

export const listarObjetos = async (page: Page): Promise<readonly ObjetoApi[]> => {
  const respuesta = await page.request.get(`/api/objetos?limite=${LIMITE_LISTA}`);
  if (!respuesta.ok()) {
    throw new Error(`No se pudieron listar los objetos (HTTP ${respuesta.status()})`);
  }
  const cuerpo = (await respuesta.json()) as { readonly objetos: readonly ObjetoApi[] };
  return cuerpo.objetos;
};

export const limpiarObjetos = async (page: Page): Promise<void> => {
  for (let pasada = 0; pasada < MAX_PASADAS_LIMPIEZA; pasada += 1) {
    const objetos = await listarObjetos(page);
    if (objetos.length === 0) {
      return;
    }
    for (const objeto of objetos) {
      await page.request.delete(`/api/objetos/${encodeURIComponent(objeto.id)}?confirmar=1`);
    }
  }
  const restantes = await listarObjetos(page);
  if (restantes.length > 0) {
    throw new Error(`Quedaron ${restantes.length} objetos sin borrar antes del test`);
  }
};

export const crearObjeto = async (page: Page, cuerpo: CuerpoObjeto): Promise<ObjetoApi> => {
  const respuesta = await page.request.post("/api/objetos", { data: cuerpo });
  if (!respuesta.ok()) {
    throw new Error(`No se pudo crear "${cuerpo.titulo}" (HTTP ${respuesta.status()})`);
  }
  return (await respuesta.json()) as ObjetoApi;
};

export const obtenerObjeto = async (page: Page, id: string): Promise<ObjetoApi> => {
  const respuesta = await page.request.get(`/api/objetos/${encodeURIComponent(id)}`);
  if (!respuesta.ok()) {
    throw new Error(`No se pudo leer el objeto ${id} (HTTP ${respuesta.status()})`);
  }
  return (await respuesta.json()) as ObjetoApi;
};

export const esperarResultados = async (
  page: Page,
  consulta: string,
  total: number,
): Promise<void> => {
  await expect
    .poll(async () => {
      const respuesta = await page.request.get(
        `/api/buscar?q=${encodeURIComponent(consulta)}&limite=50`,
      );
      if (!respuesta.ok()) {
        return -1;
      }
      const cuerpo = (await respuesta.json()) as { readonly resultados: readonly unknown[] };
      return cuerpo.resultados.length;
    })
    .toBe(total);
};
