#!/usr/bin/env node
import { ejectComponent, components } from "./registry.mjs";

const [cmd, name, ...rest] = process.argv.slice(2);
const dirFlag = rest.indexOf("--dir");
const destDir = dirFlag >= 0 ? rest[dirFlag + 1] : "components/ui";

if (cmd !== "add" || !name) {
  console.log("Usage: moderate add <component> [--dir <path>]\nComponents: " + Object.keys(components).join(", "));
  process.exit(name ? 0 : 1);
}
try {
  const written = ejectComponent(name, destDir);
  console.log("Added " + name + ":\n" + written.map((w) => "  " + w).join("\n"));
} catch (e) {
  console.error(String(e.message || e));
  process.exit(1);
}
