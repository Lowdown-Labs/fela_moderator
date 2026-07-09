import unhomoglyph from "unhomoglyph";

export function skeleton(text) {
  return unhomoglyph(text.normalize("NFKC"));
}

const CLUSTER = /\P{M}\p{M}*|\p{M}+/gu;

export function normalize(text, { lowercase = false } = {}) {
  let normalized = "";
  const srcStart = [];
  const srcEnd = [];
  for (const m of text.matchAll(CLUSTER)) {
    const units = m[0].length;
    let mapped = skeleton(m[0]);
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
