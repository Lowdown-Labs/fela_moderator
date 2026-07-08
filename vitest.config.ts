import { defineConfig, configDefaults } from "vitest/config";
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    setupFiles: ["./react/test-setup.ts"],
    globals: true,
    // reference/**/*.test.mjs are standalone node scripts (ok() harness + process.exit); they run via
    // `node`/`npm run test:detectors` in `npm test`, not under vitest. Vitest owns the react/web/bin suites.
    exclude: [...configDefaults.exclude, "reference/**/*.test.mjs"],
  },
});
