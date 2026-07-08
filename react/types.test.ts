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

import type { Reason, ModerationResult } from "./types";

describe("explainability types", () => {
  it("Reason and ModerationResult are usable", () => {
    const r: Reason = {
      source: "wordlist",
      detector: "naughty-words:es",
      label: "slur",
      span: [12, 18],
      matched: "x",
      score: 1,
      language: "es",
    };
    const result: ModerationResult = {
      flagged: true,
      categories: { profanity: 1 },
      piiSpans: [],
      reasons: [r],
      normalizedText: "x",
    };
    expect(result.reasons[0].source).toBe("wordlist");
    expect(result.categories.profanity).toBe(1);
  });
});
