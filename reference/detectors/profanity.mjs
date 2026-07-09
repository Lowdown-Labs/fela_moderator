import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import leo from "leo-profanity";

const MATCHER = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LEO = new RegExp("\\b(" + leo.list().map(esc).join("|") + ")\\b", "gi");

const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1];

export function detect(text) {
  const flags = [];
  for (const m of MATCHER.getAllMatches(text, true)) {
    const span = [m.startIndex, m.endIndex + 1];
    const matched = text.slice(span[0], span[1]);
    if (!/[a-z]/i.test(matched)) continue;
    flags.push({
      source: "wordlist",
      detector: "obscenity",
      label: "profanity",
      span,
      matched,
      score: 1,
      category: "profanity",
      language: "en",
    });
  }
  for (const m of text.matchAll(LEO)) {
    const span = [m.index, m.index + m[0].length];
    if (flags.some((f) => overlaps(f.span, span))) continue;
    flags.push({
      source: "wordlist",
      detector: "leo-profanity",
      label: "profanity",
      span,
      matched: m[0],
      score: 1,
      category: "profanity",
      language: "en",
    });
  }
  return flags;
}
