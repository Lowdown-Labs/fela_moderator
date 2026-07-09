import validator from "validator";

const CANDIDATES = [
  {
    label: "EMAIL",
    detector: "validator.email",
    re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    valid: (v) => validator.isEmail(v),
  },
  { label: "URL", detector: "validator.url", re: /\bhttps?:\/\/[^\s]+/gi, valid: (v) => validator.isURL(v) },
  {
    label: "CREDITCARD",
    detector: "validator.creditcard",
    re: /\b(?:\d[ -]?){13,19}\b/g,
    valid: (v) => validator.isCreditCard(v.replace(/[ -]/g, "")),
  },
];

export function detect(text) {
  const flags = [];
  for (const c of CANDIDATES) {
    for (const m of text.matchAll(c.re)) {
      const val = m[0];
      if (!c.valid(val)) continue;
      flags.push({
        source: "rule",
        detector: c.detector,
        label: c.label,
        span: [m.index, m.index + val.length],
        matched: val,
        score: 1,
        category: "pii",
      });
    }
  }
  return flags;
}
