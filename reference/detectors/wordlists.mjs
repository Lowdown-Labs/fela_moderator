import nw from "naughty-words";

export const DEFAULT_LANGS = ["es", "pt", "fr", "de", "it", "ru", "ar"];
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cache = new Map();

function langRe(lang) {
  if (cache.has(lang)) return cache.get(lang);
  const words = (nw[lang] || []).filter(Boolean).map(esc);
  const re = words.length ? new RegExp("(?<![\\p{L}\\p{N}])(" + words.join("|") + ")(?![\\p{L}\\p{N}])", "giu") : null;
  cache.set(lang, re);
  return re;
}

export function detect(text, { langs = DEFAULT_LANGS } = {}) {
  const flags = [];
  for (const lang of langs) {
    const re = langRe(lang);
    if (!re) continue;
    for (const m of text.matchAll(re)) {
      flags.push({
        source: "wordlist",
        detector: "naughty-words:" + lang,
        label: "slur",
        span: [m.index, m.index + m[0].length],
        matched: m[0],
        score: 1,
        category: "profanity",
        language: lang,
      });
    }
  }
  return flags;
}
