// The two-knob submit-time gate: FOSS structured-PII + (optional) neural toxicity/unstructured PII
// -> a stable Finding[] plus blocked/warned booleans. Control is two dials; detection stays granular.
import { MODEL_OWNED, structuredPII } from "./checkers.mjs";

/** @typedef {"block"|"warn"|"off"} Severity */
/** @typedef {{ pii: Severity, toxicity: Severity }} Policy */
/** @typedef {{ category:"pii"|"toxicity", type:string, severity:Severity, text:string,
 *             start:number, end:number, source:"regex"|"model", suggestion?:string }} Finding */

export const DEFAULT_POLICY = { pii: "block", toxicity: "block" };

/** Partial mask for a finding's value: EMAIL keeps first char + domain hint; else keep first & last. */
export function maskValue(finding) {
  const t = finding.text || "";
  if (finding.type === "EMAIL") {
    const [user = "", domain = ""] = t.split("@");
    return (user[0] || "") + "***@" + (domain || "***");
  }
  if (t.length <= 2) return "*".repeat(t.length);
  return t[0] + "*".repeat(t.length - 2) + t[t.length - 1];
}

/** Replace each spanned finding (start>=0) with its mask, back-to-front so offsets stay valid. */
export function redactText(text, findings) {
  const spanned = findings.filter((f) => f.start >= 0 && f.end > f.start).sort((a, b) => b.start - a.start);
  let out = text;
  for (const f of spanned) out = out.slice(0, f.start) + maskValue(f) + out.slice(f.end);
  return out;
}

/**
 * @param {string} text
 * @param {{ neural?: any, policy?: Policy }} [opts]
 * @returns {{ findings: Finding[], blocked: boolean, warned: boolean }}
 */
export function check(text, { neural = null, policy = DEFAULT_POLICY } = {}) {
  const pol = { ...DEFAULT_POLICY, ...policy };
  const findings = [];

  const addPII = (f, source) => {
    const finding = { category: "pii", severity: pol.pii, source, ...f };
    finding.suggestion = maskValue(finding);
    findings.push(finding);
  };

  // structured PII (regex owns email/phone/SSN/card/IP/IBAN/URL)
  for (const p of structuredPII(text)) addPII({ type: p.type, text: p.text, start: p.start, end: p.end }, "regex");

  // unstructured PII from the model (names/addresses); structured model entities dropped (regex owns them)
  for (const p of neural?.pii || []) {
    if (!MODEL_OWNED.has(p.entity)) continue;
    addPII({ type: p.entity, text: p.text, start: p.utf16Start, end: p.utf16End }, "model");
  }

  // toxicity: one finding per flagged label, no span
  for (const [label, v] of Object.entries(neural?.toxicity || {})) {
    if (!v.flagged) continue;
    findings.push({ category: "toxicity", type: label, severity: pol.toxicity, text: "", start: -1, end: -1, source: "model" });
  }

  const blocked = findings.some((f) => f.severity === "block");
  const warned = findings.some((f) => f.severity === "warn");
  return { findings, blocked, warned };
}
