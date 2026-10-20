import { test as base, expect } from "@playwright/test";
import { limpiarObjetos } from "./support/api";

export const test = base;

test.beforeEach(async ({ page }) => {
  await limpiarObjetos(page);
});

export { expect };
