import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";

// Wczytaj dane logowania E2E z gitignorowanego .env.e2e (bez dodatkowej zależności).
try {
  const raw = readFileSync(".env.e2e", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  // brak pliku — testy same zgłoszą brak zmiennych
}

const BASE_URL = process.env.E2E_BASE_URL || "https://www.mollien.pl";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "off",
    screenshot: "off",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
      dependencies: ["setup"],
    },
  ],
});
