import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { CONTRASENA_E2E, USUARIO_E2E } from "../support/credenciales";

const AUTH_FILE = fileURLToPath(new URL("../.auth/session.json", import.meta.url));

test("primer arranque: crea la contraseña, cierra sesión y vuelve a entrar", async ({ page }) => {
  await test.step("el primer arranque pide crear la contraseña", async () => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Crea tu contraseña" })).toBeVisible();
  });

  await test.step("crea la contraseña y entra autenticado", async () => {
    await page.getByLabel("Usuario").fill(USUARIO_E2E);
    await page.getByLabel("Contraseña", { exact: true }).fill(CONTRASENA_E2E);
    await page.getByLabel("Confirmar contraseña").fill(CONTRASENA_E2E);
    await page.getByRole("button", { name: "Crear contraseña" }).click();

    await expect(page).toHaveURL(/\/notas$/);
    await expect(page.getByRole("heading", { name: "Notas", level: 1 })).toBeVisible();
    await expect(page.getByText("Sesión activa")).toBeVisible();
  });

  await test.step("cierra sesión y vuelve a entrar con la contraseña", async () => {
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page.getByRole("heading", { name: "Acceso" })).toBeVisible();

    await page.getByLabel("Usuario").fill(USUARIO_E2E);
    await page.getByLabel("Contraseña").fill(CONTRASENA_E2E);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/notas$/);
    await expect(page.getByText("Sesión activa")).toBeVisible();
  });

  mkdirSync(dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
