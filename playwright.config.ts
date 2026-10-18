import { defineConfig } from "@playwright/test";

// Browser-Tests gegen die lokal laufende App (npm run docker:dev). Siehe e2e/global-setup.ts.

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3002";
export const AUTH_FILE = "e2e/.auth/user.json";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // Die Tests teilen sich einen Nutzer und die Mediathek; nacheinander bleibt es übersichtlich.
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    storageState: AUTH_FILE,
    // Das installierte Google Chrome, kein Browser-Download nötig.
    channel: "chrome",
    viewport: { width: 1300, height: 1000 },
    trace: "retain-on-failure",
  },
});
