import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ejectComponent, components } from "./registry.mjs";

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "fela-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("eject", () => {
  it("registry lists moderated-textarea with its files", () => {
    expect(components["moderated-textarea"]).toEqual(expect.arrayContaining(["react/ModeratedTextarea.tsx", "react/useModeration.ts"]));
  });

  it("copies files and rewrites the package import", () => {
    ejectComponent("moderated-textarea", dir);
    const out = join(dir, "ModeratedTextarea.tsx");
    expect(existsSync(out)).toBe(true);
    expect(existsSync(join(dir, "useModeration.ts"))).toBe(true);
    const src = readFileSync(join(dir, "useModeration.ts"), "utf8");
    expect(src).toContain('from "@lowdown/moderate"');
    expect(src).not.toContain("../reference/validate.mjs");
  });

  it("throws on unknown component", () => {
    expect(() => ejectComponent("nope", dir)).toThrow(/unknown component/i);
  });
});
