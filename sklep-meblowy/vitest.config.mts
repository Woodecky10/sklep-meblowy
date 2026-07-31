import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Pure-function tests only (planDeactivations/retry/resolveBlFeatures/obrazy) →
// środowisko node. vite-tsconfig-paths rozwiązuje alias @/* z tsconfig.json.
// server-only → pusty stub, żeby testy mogły importować moduły używające tego
// guard-a (np. store-settings.ts) bez błędu "Cannot find package".
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": new URL("./app/_lib/__tests__/__mocks__/server-only.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["app/**/__tests__/**/*.test.ts"],
  },
});
