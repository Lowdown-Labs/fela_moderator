const RULES = [
  {
    label: "SSN",
    re: /\b\d{3}-\d{2}-\d{4}\b/g,
    valid: (v) => {
      const [a, b, c] = v.split("-");
      return a !== "000" && a !== "666" && a[0] !== "9" && b !== "00" && c !== "0000";
    },
  },
  { label: "IBAN", re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, valid: () => true },
  { label: "BIC", re: /\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g, valid: () => true },
  { label: "BITCOINADDRESS", re: /\b(?:bc1[a-z0-9]{25,39}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g, valid: () => true },
  { label: "ETHEREUMADDRESS", re: /\b0x[a-fA-F0-9]{40}\b/g, valid: () => true },
];

export function detect(text) {
  const flags = [];
  for (const r of RULES) {
    for (const m of text.matchAll(r.re)) {
      if (!r.valid(m[0])) continue;
      flags.push({
        source: "rule",
        detector: "presidio." + r.label.toLowerCase(),
        label: r.label,
        span: [m.index, m.index + m[0].length],
        matched: m[0],
        score: 1,
        category: "pii",
      });
    }
  }
  return flags;
}
