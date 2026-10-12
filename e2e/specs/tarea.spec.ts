import { expect, test } from "../fixtures";
import { obtenerObjeto } from "../support/api";
import { fechaLocal } from "../support/fecha";

test("crear una tarea, verla en Hoy y Pendientes y marcarla como hecha", async ({ page }) => {
  const titulo = "Tarea E2E de prueba";
  const hoy = fechaLocal(new Date());

  await test.step("crea la tarea con vencimiento hoy", async () => {
    await page.goto("/tareas");
    await page.getByRole("button", { name: "Nueva tarea" }).click();

    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Título").fill(titulo);
    await dialogo.getByLabel("Fecha límite").fill(hoy);
    await dialogo.getByRole("button", { name: "Crear tarea" }).click();

    await expect(dialogo).toBeHidden();
  });

  await test.step("aparece en la vista Hoy", async () => {
    await expect(page.getByRole("link", { name: titulo })).toBeVisible();
  });

  await test.step("aparece en la vista Pendientes", async () => {
    await page.getByRole("button", { name: "Pendientes" }).click();
    await expect(page.getByRole("article").filter({ hasText: titulo })).toBeVisible();
  });

  await test.step("marcarla como hecha la quita de Pendientes", async () => {
    const fila = page.getByRole("article").filter({ hasText: titulo });
    await fila.getByRole("combobox", { name: `Estado de ${titulo}` }).selectOption("hecha");
    await expect(page.getByRole("article").filter({ hasText: titulo })).toHaveCount(0);
  });

  await test.step("sigue en Hoy y en Todas con estado hecha", async () => {
    await page.getByRole("button", { name: "Hoy" }).click();
    const filaHoy = page.getByRole("article").filter({ hasText: titulo });
    await expect(filaHoy).toBeVisible();
    await expect(filaHoy.getByRole("combobox")).toHaveValue("hecha");

    await page.getByRole("button", { name: "Todas" }).click();
    const filaTodas = page.getByRole("article").filter({ hasText: titulo });
    await expect(filaTodas).toBeVisible();
    await expect(filaTodas.getByRole("combobox")).toHaveValue("hecha");
  });

  await test.step("el estado y la fecha de completada persisten", async () => {
    const href = await page.getByRole("link", { name: titulo }).getAttribute("href");
    const id = decodeURIComponent(href?.split("/").pop() ?? "");
    expect(id).not.toBe("");

    const objeto = await obtenerObjeto(page, id);
    expect(objeto.atributos.estado).toBe("hecha");
    expect(typeof objeto.atributos.completada).toBe("string");
  });
});
