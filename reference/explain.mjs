export function explainReason(r) {
  const lang = r.language ? ":" + r.language : "";
  const score = r.score != null ? ", " + r.score.toFixed(2) : "";
  const where = r.span ? ` at chars ${r.span[0]} to ${r.span[1]}` : "";
  const matched = r.matched ? ` '${r.matched}'` : "";
  return `${r.label} (${r.source}${lang}${score}) via ${r.detector}${matched}${where}`;
}

export function explain(result) {
  if (!result.flagged) return "No moderation flags.";
  return "Flagged " + result.reasons.map(explainReason).join("; ") + ".";
}
