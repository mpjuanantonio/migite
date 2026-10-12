import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const PORT = "4173";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const AUTH_FILE = fileURLToPath(new URL("./e2e/.auth/session.json", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testDir: "./e2e/setup",
    },
    {
      name: "chromium",
      testDir: "./e2e/specs",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm --filter @migite/server exec tsx e2e/serve.ts",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      PORT,
      E2E_ROOT: ".e2e",
    },
  },
});
