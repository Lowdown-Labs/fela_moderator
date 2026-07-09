import { defineConfig, configDefaults } from "vitest/config";
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    setupFiles: ["./react/test-setup.ts"],
    globals: true,
    exclude: [...configDefaults.exclude, "reference/**/*.test.mjs"],
  },
});
