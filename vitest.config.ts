import { defineConfig, configDefaults } from "vitest/config";
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    setupFiles: ["./react/test-setup.ts"],
    globals: true,
    // reference/validate.test.mjs is a standalone node script (calls process.exit); it runs via `node` in `npm test`.
    exclude: [...configDefaults.exclude, "reference/validate.test.mjs"],
  },
});
