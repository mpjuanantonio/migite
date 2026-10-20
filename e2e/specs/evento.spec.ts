import { expect, test } from "../fixtures";
import { claveDia } from "../support/fecha";

test("crear un evento en el calendario y moverlo de día arrastrando", async ({ page }) => {
  const titulo = "Evento E2E de prueba";
  const ahora = new Date();
  const origen = new Date(ahora.getFullYear(), ahora.getMonth(), 5);
  const destino = new Date(ahora.getFullYear(), ahora.getMonth(), 12);
  const claveOrigen = claveDia(origen);
  const claveDestino = claveDia(destino);

  const celdaOrigen = page.locator(`td[data-dia="${claveOrigen}"]`);
  const celdaDestino = page.locator(`td[data-dia="${claveDestino}"]`);

  await test.step("crea el evento desde su día en la vista de mes", async () => {
    await page.goto("/calendario");
    await expect(page.getByRole("button", { name: "Mes", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await celdaOrigen.getByRole("button").click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Título").fill(titulo);
    await dialogo.getByRole("button", { name: "Crear evento" }).click();

    await expect(dialogo).toBeHidden();
    await expect(celdaOrigen.getByRole("link", { name: titulo })).toBeVisible();
  });

  await test.step("lo arrastra a otro día", async () => {
    const chip = celdaOrigen.getByRole("link", { name: titulo });
    await chip.dragTo(celdaDestino);

    await expect(celdaDestino.getByRole("link", { name: titulo })).toBeVisible();
    await expect(celdaOrigen.getByRole("link", { name: titulo })).toHaveCount(0);
  });

  await test.step("el cambio de fecha persiste", async () => {
    await page.reload();
    await expect(celdaDestino.getByRole("link", { name: titulo })).toBeVisible();
    await expect(celdaOrigen.getByRole("link", { name: titulo })).toHaveCount(0);
  });
});
