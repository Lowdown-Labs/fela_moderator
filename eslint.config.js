// Flat ESLint config. Bug-catching rules only (no stylistic churn — Prettier owns formatting).
// JS/MJS across node + browser; TS/TSX via typescript-eslint. Demo/model/dist are not linted.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["node_modules", "demo", "model", "**/dist", "coverage"] },
  {
    files: ["**/*.{js,mjs}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [...tseslint.configs.recommended],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // classic hook-correctness rules only; the plugin's v7 compiler-era rules
      // (set-state-in-effect, refs) are opinionated perf lints, not bug-catchers.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
