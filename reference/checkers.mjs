const RE = {
  EMAIL: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  URL: /\bhttps?:\/\/[^\s]+/gi,
  IPV6: /\b(?:[A-F0-9]{1,4}:){2,7}[A-F0-9]{1,4}\b/gi,
  IPV4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  IBAN: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
  SSN: /\b\d{3}-\d{2}-\d{4}\b/g,
  CREDITCARD: /\b(?:\d[ -]?){13,19}\b/g,
  PHONE: /(?:\+?\d[\d\-\s().]{7,}\d)/g,
};

const PRIORITY = ["EMAIL", "URL", "IBAN", "IPV6", "IPV4", "SSN", "CREDITCARD", "PHONE"];

function luhn(s) {
  const d = s.replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0,
    alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = +d[i];
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function dedupeOverlaps(hits) {
  const rank = (t) => PRIORITY.indexOf(t);
  hits.sort((a, b) => a.start - b.start || rank(a.type) - rank(b.type) || b.end - b.start - (a.end - a.start));
  const kept = [];
  for (const h of hits) {
    if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h);
  }
  return kept;
}

export function structuredPII(text) {
  const hits = [];
  for (const [type, re] of Object.entries(RE)) {
    for (const m of text.matchAll(re)) {
      const val = m[0];
      if (type === "CREDITCARD" && !luhn(val)) continue;
      if (type === "IPV4" && val.split(".").some((o) => +o > 255)) continue;
      if (type === "PHONE" && val.replace(/\D/g, "").length < 7) continue;
      hits.push({ type, text: val, start: m.index, end: m.index + val.length, source: "regex" });
    }
  }
  return dedupeOverlaps(hits);
}

export const MODEL_OWNED = new Set([
  "FIRSTNAME",
  "LASTNAME",
  "MIDDLENAME",
  "PREFIX",
  "USERNAME",
  "ACCOUNTNAME",
  "STREET",
  "CITY",
  "STATE",
  "COUNTY",
  "ZIPCODE",
  "BUILDINGNUMBER",
  "SECONDARYADDRESS",
  "AGE",
  "DOB",
]);
