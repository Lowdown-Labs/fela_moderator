// Human-readable "why": render structured Reasons as plain English. Pure, no dependencies.
/** @param {import("../react/types").Reason} r */
export function explainReason(r) {
  const lang = r.language ? ":" + r.language : "";
  const score = r.score != null ? ", " + r.score.toFixed(2) : "";
  const where = r.span ? ` at chars ${r.span[0]}–${r.span[1]}` : "";
  const matched = r.matched ? ` '${r.matched}'` : "";
  return `${r.label} (${r.source}${lang}${score}) via ${r.detector}${matched}${where}`;
}

/** @param {import("../react/types").ModerationResult} result */
export function explain(result) {
  if (!result.flagged) return "No moderation flags.";
  return "Flagged " + result.reasons.map(explainReason).join("; ") + ".";
}
