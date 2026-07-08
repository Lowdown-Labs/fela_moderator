// Spam/scam heuristics: URL shorteners + configurable scam keyword phrases. Configurable lists so a
// consumer can tune precision. Deterministic, span-accurate.
export const DEFAULT_CONFIG = {
  shorteners: ["bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "buff.ly", "is.gd"],
  keywords: ["free prize", "you won", "act now", "wire transfer", "gift card", "crypto giveaway", "claim your"],
};
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** @returns {Array<{source:"rule",detector:string,label:string,span:[number,number],matched:string,score:1,category:"spam"}>} */
export function detect(text, { config = DEFAULT_CONFIG } = {}) {
  const flags = [];
  const shRe = new RegExp("\\b(?:" + config.shorteners.map(esc).join("|") + ")\\/\\S+", "gi");
  for (const m of text.matchAll(shRe))
    flags.push({
      source: "rule",
      detector: "spam.shortener",
      label: "SHORTENER",
      span: [m.index, m.index + m[0].length],
      matched: m[0],
      score: 1,
      category: "spam",
    });
  const kwRe = new RegExp("\\b(" + config.keywords.map(esc).join("|") + ")\\b", "gi");
  for (const m of text.matchAll(kwRe))
    flags.push({
      source: "rule",
      detector: "spam.keyword",
      label: "SCAM_KEYWORD",
      span: [m.index, m.index + m[0].length],
      matched: m[0],
      score: 1,
      category: "spam",
    });
  return flags;
}
