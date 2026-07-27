import { defineConfig, devices } from "@playwright/test";

// Konfiguracja do lokalnej weryfikacji (bez logowania admina) — celuje w dev
// server z fixem. Uruchomienie:
//   E2E_BASE_URL=http://localhost:3210 npx playwright test --config=playwright.local.config.ts
export default defineConfig({
  testDir: "./e2e",
  testMatch: /(corner-side|filter-pending|variant-tooltip)\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3210",
    trace: "off",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
