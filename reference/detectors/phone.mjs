import glpn from "google-libphonenumber";

const UTIL = glpn.PhoneNumberUtil.getInstance();
const CANDIDATE = /\+?\d[\d\-\s().]{6,}\d/g;

export function detect(text, { region = "US" } = {}) {
  const flags = [];
  for (const m of text.matchAll(CANDIDATE)) {
    const val = m[0];
    try {
      const num = UTIL.parseAndKeepRawInput(val, region);
      if (!UTIL.isPossibleNumber(num)) continue;
      const e164 = UTIL.format(num, glpn.PhoneNumberFormat.E164);
      flags.push({
        source: "rule",
        detector: "libphonenumber",
        label: "PHONE",
        span: [m.index, m.index + val.length],
        matched: val,
        score: 1,
        category: "pii",
        suggestion: e164,
      });
    } catch {}
  }
  return flags;
}
