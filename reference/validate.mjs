import { moderate } from "./engine.mjs";

export const DEFAULT_POLICY = { pii: "block", toxicity: "block" };

export function maskValue(finding) {
  const t = finding.text || "";
  if (finding.type === "EMAIL") {
    const [user = "", domain = ""] = t.split("@");
    return (user[0] || "") + "***@" + (domain || "***");
  }
  if (t.length <= 2) return "*".repeat(t.length);
  return t[0] + "*".repeat(t.length - 2) + t[t.length - 1];
}

export function redactText(text, findings) {
  const spanned = findings.filter((f) => f.start >= 0 && f.end > f.start).sort((a, b) => b.start - a.start);
  let out = text;
  for (const f of spanned) out = out.slice(0, f.start) + maskValue(f) + out.slice(f.end);
  return out;
}

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

export { moderate, moderateAsync } from "./engine.mjs";
export { explain, explainReason } from "./explain.mjs";
export { moderationSchema, zodRefine } from "./schema.mjs";
