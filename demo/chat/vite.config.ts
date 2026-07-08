import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      "@lowdown/moderate/react": r("../../react/index.ts"),
      "@lowdown/moderate": r("../../reference/validate.mjs"),
    },
  },
});
