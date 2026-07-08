// google-libphonenumber adapter (Apache-2.0): extract phone-ish candidates, then parse + validate.
// The JS port's in-text matcher is unreliable, so extract-then-validate is the robust path.
import glpn from "google-libphonenumber";

const UTIL = glpn.PhoneNumberUtil.getInstance();
const CANDIDATE = /\+?\d[\d\-\s().]{6,}\d/g; // 8+ chars starting/ending with a digit

/** @returns {Array<{source:"rule",detector:"libphonenumber",label:"PHONE",span:[number,number],matched:string,score:1,category:"pii",suggestion?:string}>} */
export function detect(text, { region = "US" } = {}) {
  const flags = [];
  for (const m of text.matchAll(CANDIDATE)) {
    const val = m[0];
    try {
      const num = UTIL.parseAndKeepRawInput(val, region);
      if (!UTIL.isValidNumber(num)) continue;
      const e164 = UTIL.format(num, glpn.PhoneNumberFormat.E164);
      flags.push({ source: "rule", detector: "libphonenumber", label: "PHONE", span: [m.index, m.index + val.length], matched: val, score: 1, category: "pii", suggestion: e164 });
    } catch { /* unparseable candidate — skip */ }
  }
  return flags;
}
