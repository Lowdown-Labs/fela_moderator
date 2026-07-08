// The two-knob submit-time gate: FOSS structured-PII + (optional) neural toxicity/unstructured PII
// -> a stable Finding[] plus blocked/warned booleans. Control is two dials; detection stays granular.
import { moderate } from "./engine.mjs";

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
  const result = moderate(text, { neural });
  const piiKey = new Set(result.piiSpans.map((p) => `${p.entity}|${p.span[0]}|${p.span[1]}`));
  const findings = result.reasons.map((r) => {
    const isPII = r.span ? piiKey.has(`${r.label}|${r.span[0]}|${r.span[1]}`) : false;
    const category = isPII ? "pii" : "toxicity";
    const finding = {
      category,
      type: r.label,
      severity: category === "pii" ? pol.pii : pol.toxicity,
      text: r.matched || "",
      start: r.span ? r.span[0] : -1,
      end: r.span ? r.span[1] : -1,
      source: r.source === "model" ? "model" : "regex",
    };
    if (isPII) finding.suggestion = maskValue(finding);
    return finding;
  });
  const blocked = findings.some((f) => f.severity === "block");
  const warned = findings.some((f) => f.severity === "warn");
  return { findings, blocked, warned };
}
