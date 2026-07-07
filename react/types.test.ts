import { describe, it, expect } from "vitest";
import type { Finding, Policy, Decision } from "./types";
import { check, DEFAULT_POLICY, redactText } from "../reference/validate.mjs";

describe("core types are usable from TS", () => {
  it("check returns a typed GateResult", () => {
    const policy: Policy = { pii: "warn", toxicity: "block" };
    const g = check("email joe@example.com", { policy });
    const first: Finding = g.findings[0];
    expect(first.category).toBe("pii");
    expect(first.severity).toBe("warn");
    const d: Decision = "redact";
    expect(redactText("a joe@example.com", g.findings)).not.toContain("joe@example.com");
    expect(DEFAULT_POLICY.pii).toBe("block");
    expect(d).toBe("redact");
  });
});
