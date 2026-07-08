// Obfuscation-defeating normalization + an offset map back to the ORIGINAL text.
// Pipeline: NFKC (folds compat forms, e.g. circled/roman/fullwidth) -> unhomoglyph (folds confusables,
// e.g. Cyrillic look-alikes) -> optional lowercasing. NFKC MUST run first (unhomoglyph leaves ⓡ alone).
// Normalization runs per cluster (a base char + its trailing combining marks) so NFKC composes
// decomposed/NFD input (e.g. "e"+U+0301 -> "é"); every normalized UTF-16 unit maps back to the whole
// original cluster span, so a normalized-coord span always maps to whole original characters.
import unhomoglyph from "unhomoglyph";

/** NFKC + unhomoglyph, whole-string, no lowercasing. Used by the materiality gate. */
export function skeleton(text) {
  return unhomoglyph(text.normalize("NFKC"));
}

const CLUSTER = /\P{M}\p{M}*|\p{M}+/gu; // a base char + trailing combining marks (or leading marks)

/**
 * @param {string} text
 * @param {{ lowercase?: boolean }} [opts]
 * @returns {{ normalized: string, map: { toOriginal(nStart:number,nEnd:number):[number,number], srcStart:number[], srcEnd:number[] } }}
 */
export function normalize(text, { lowercase = false } = {}) {
  let normalized = "";
  const srcStart = []; // per normalized UTF-16 unit: original start index
  const srcEnd = []; // per normalized UTF-16 unit: original end index (exclusive)
  for (const m of text.matchAll(CLUSTER)) {
    const units = m[0].length; // UTF-16 units in this original cluster
    let mapped = skeleton(m[0]); // per-cluster normalization composes base+marks
    if (lowercase) mapped = mapped.toLowerCase();
    for (let k = 0; k < mapped.length; k++) {
      srcStart.push(m.index);
      srcEnd.push(m.index + units);
    }
    normalized += mapped;
  }
  const map = {
    srcStart,
    srcEnd,
    toOriginal(nStart, nEnd) {
      if (nEnd <= nStart) {
        const p = srcStart[nStart] ?? text.length;
        return [p, p];
      }
      let s = Infinity,
        e = -Infinity;
      for (let i = nStart; i < nEnd; i++) {
        if (srcStart[i] < s) s = srcStart[i];
        if (srcEnd[i] > e) e = srcEnd[i];
      }
      return [s, e];
    },
  };
  return { normalized, map };
}
