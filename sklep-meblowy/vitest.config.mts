import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Pure-function tests only (planDeactivations/retry/resolveBlFeatures/obrazy) →
// środowisko node. vite-tsconfig-paths rozwiązuje alias @/* z tsconfig.json.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["app/**/__tests__/**/*.test.ts"],
  },
});
