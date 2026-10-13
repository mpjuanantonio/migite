import { expect, test } from "../fixtures";

test("crear, editar, renombrar y borrar una nota", async ({ page }) => {
  const titulo = "Nota E2E de prueba";
  const cuerpo = "Cuerpo editado de la nota E2E";
  const tituloRenombrado = "Nota E2E renombrada";

  await test.step("crea la nota desde el listado", async () => {
    await page.goto("/notas");
    await page.getByRole("button", { name: "Nueva nota" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByLabel("Tipo")).toHaveValue("nota");
    await dialogo.getByLabel("Título").fill(titulo);
    await dialogo.getByRole("button", { name: "Crear objeto" }).click();

    await expect(dialogo).toBeHidden();
    await expect(page.getByRole("heading", { name: titulo, level: 1 })).toBeVisible();
  });

  await test.step("aparece en el listado de notas", async () => {
    await page.getByRole("link", { name: "Notas" }).click();
    await expect(page).toHaveURL(/\/notas$/);
    await expect(page.getByRole("link", { name: titulo })).toBeVisible();
  });

  await test.step("edita el cuerpo, autoguarda y el cambio persiste", async () => {
    await page.getByRole("link", { name: titulo }).click();

    const editor = page.getByRole("textbox", { name: "Cuerpo de la ficha en markdown" });
    await editor.fill(cuerpo);
    await expect(page.getByRole("status", { name: "Guardado" })).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "Cuerpo de la ficha en markdown" }),
    ).toContainText(cuerpo);
  });

  await test.step("renombra la nota", async () => {
    await page.getByRole("button", { name: "Renombrar" }).click();

    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Nuevo título").fill(tituloRenombrado);
    await dialogo.getByRole("button", { name: "Renombrar" }).click();

    await expect(dialogo).toBeHidden();
    await expect(page.getByRole("heading", { name: tituloRenombrado, level: 1 })).toBeVisible();
  });

  await test.step("borra la nota con confirmación", async () => {
    await page.getByRole("link", { name: "Notas" }).click();
    await expect(page.getByRole("link", { name: tituloRenombrado })).toBeVisible();
    await page.getByRole("link", { name: tituloRenombrado }).click();

    await page.getByRole("button", { name: "Borrar", exact: true }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText(`¿Borrar «${tituloRenombrado}»?`)).toBeVisible();
    await dialogo.getByRole("button", { name: "Borrar ficha" }).click();

    await expect(page).toHaveURL(/\/notas$/);
    await expect(page.getByRole("link", { name: tituloRenombrado })).toHaveCount(0);
  });
});
