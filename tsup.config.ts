import { cpSync } from "node:fs";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "react/index.ts" },
  outDir: "dist/react",
  format: ["esm"],
  target: "es2020",
  platform: "neutral",
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  external: [/\.css$/, "react", "react-dom", "react/jsx-runtime"],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
  async onSuccess() {
    cpSync("react/fela.css", "dist/react/fela.css");
  },
});
