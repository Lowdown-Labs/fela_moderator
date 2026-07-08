// Obfuscation-defeating normalization + an offset map back to the ORIGINAL text.
// Pipeline: NFKC (folds compat forms, e.g. circled/roman/fullwidth) -> unhomoglyph (folds confusables,
// e.g. Cyrillic look-alikes) -> optional lowercasing. NFKC MUST run first (unhomoglyph leaves ⓡ alone).
// The map records, per normalized UTF-16 unit, the source original char's [start,end) so any span in
// normalized coords maps back to whole original characters.
import unhomoglyph from "unhomoglyph";

/** NFKC + unhomoglyph, whole-string, no lowercasing. Used by the materiality gate. */
export function skeleton(text) {
  return unhomoglyph(text.normalize("NFKC"));
}

/**
 * @param {string} text
 * @param {{ lowercase?: boolean }} [opts]
 * @returns {{ normalized: string, map: { toOriginal(nStart:number,nEnd:number):[number,number], srcStart:number[], srcEnd:number[] } }}
 */
export function normalize(text, { lowercase = false } = {}) {
  let normalized = "";
  const srcStart = []; // per normalized UTF-16 unit: original start index
  const srcEnd = [];   // per normalized UTF-16 unit: original end index (exclusive)
  let origIdx = 0;
  for (const ch of text) {                 // iterate original by code point
    const cpUnits = ch.length;             // 1 or 2 UTF-16 units in the original
    let mapped = skeleton(ch);             // per-code-point normalization
    if (lowercase) mapped = mapped.toLowerCase();
    for (let k = 0; k < mapped.length; k++) { srcStart.push(origIdx); srcEnd.push(origIdx + cpUnits); }
    normalized += mapped;
    origIdx += cpUnits;
  }
  const map = {
    srcStart, srcEnd,
    toOriginal(nStart, nEnd) {
      if (nEnd <= nStart) { const p = srcStart[nStart] ?? origIdx; return [p, p]; }
      let s = Infinity, e = -Infinity;
      for (let i = nStart; i < nEnd; i++) {
        if (srcStart[i] < s) s = srcStart[i];
        if (srcEnd[i] > e) e = srcEnd[i];
      }
      return [s, e];
    },
  };
  return { normalized, map };
}
