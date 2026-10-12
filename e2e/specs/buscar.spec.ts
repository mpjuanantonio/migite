import { expect, test } from "../fixtures";
import { crearObjeto, esperarResultados } from "../support/api";

test("buscar por prefijo agrupa los resultados y navega a la ficha", async ({ page }) => {
  await test.step("prepara dos notas con la misma raíz", async () => {
    await crearObjeto(page, {
      tipo: "nota",
      titulo: "Receta de manzana",
      cuerpo: "Tarta de manzanas asadas",
    });
    await crearObjeto(page, {
      tipo: "nota",
      titulo: "Compra de manzanas",
      cuerpo: "Comprar manzana golden",
    });
    await esperarResultados(page, "manz", 2);
  });

  await test.step("busca por prefijo y ve los resultados agrupados", async () => {
    await page.goto("/buscar");
    await page.getByRole("searchbox", { name: "Buscar en el archivo" }).fill("manz");
    await page.getByRole("button", { name: "Buscar" }).click();

    await expect(page.getByRole("heading", { name: "Notas (2)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Receta de manzana" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Compra de manzanas" })).toBeVisible();
  });

  await test.step("al pulsar un resultado navega a la ficha", async () => {
    await page.getByRole("link", { name: "Receta de manzana" }).click();
    await expect(page.getByRole("heading", { name: "Receta de manzana", level: 1 })).toBeVisible();
  });
});
