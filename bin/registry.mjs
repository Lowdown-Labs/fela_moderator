import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const components = {
  "moderated-textarea": [
    "react/ModeratedTextarea.tsx",
    "react/useModeration.ts",
    "react/types.ts",
    "react/fela.css",
  ],
};

/** Copy a component's files into destDir, rewriting the core import to the package name. */
export function ejectComponent(name, destDir) {
  const files = components[name];
  if (!files) throw new Error(`unknown component: ${name}`);
  mkdirSync(destDir, { recursive: true });
  for (const rel of files) {
    const dest = join(destDir, basename(rel));
    cpSync(join(ROOT, rel), dest);
    if (dest.endsWith(".ts") || dest.endsWith(".tsx")) {
      const rewritten = readFileSync(dest, "utf8").replace(/["']\.\.\/reference\/validate\.mjs["']/g, '"@lowdown/moderate"');
      writeFileSync(dest, rewritten);
    }
  }
  return files.map((f) => join(destDir, basename(f)));
}
