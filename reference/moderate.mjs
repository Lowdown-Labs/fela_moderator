export const PAD_ID = 256,
  CLS_ID = 257,
  SEP_ID = 258,
  MAX_LEN = 512;
const ENC = new TextEncoder();

export function encodeText(text, maxLen = MAX_LEN) {
  const bytes = ENC.encode(text);
  const ids = new Int32Array(maxLen).fill(PAD_ID);
  const byteOfToken = new Int32Array(maxLen).fill(-1);
  ids[0] = CLS_ID;
  const n = Math.min(bytes.length, maxLen - 1);
  for (let j = 0; j < n; j++) {
    ids[j + 1] = bytes[j];
    byteOfToken[j + 1] = j;
  }
  return { ids, byteOfToken, nBytes: bytes.length, nTokens: n + 1 };
}

export function charBoundsByByte(text) {
  const startOf = [],
    endOf = [];
  let u = 0;
  for (const ch of text) {
    const bl = ENC.encode(ch).length;
    const cu = ch.length;
    for (let b = 0; b < bl; b++) {
      startOf.push(u);
      endOf.push(u + cu);
    }
    u += cu;
  }
  return { startOf, endOf, totalUtf16: u };
}

export function piiSpans(argmaxPerToken, byteOfToken, piiTags, text) {
  const cb = charBoundsByByte(text);
  const raw = [];
  let cur = null;
  const flush = () => {
    if (cur) {
      raw.push(cur);
      cur = null;
    }
  };
  for (let t = 1; t < argmaxPerToken.length; t++) {
    const byte = byteOfToken[t];
    if (byte < 0) {
      continue;
    }
    const tag = piiTags[argmaxPerToken[t]] || "O";
    if (tag === "O") {
      flush();
      continue;
    }
    const dash = tag.indexOf("-");
    const bio = tag.slice(0, dash),
      ent = tag.slice(dash + 1);
    if (bio === "B" || !cur || cur.entity !== ent) {
      flush();
      cur = { entity: ent, byteStart: byte, byteEnd: byte + 1 };
    } else {
      cur.byteEnd = byte + 1;
    }
  }
  flush();
  return raw.map((s) => {
    const u0 = cb.startOf[s.byteStart];
    const u1 = cb.endOf[s.byteEnd - 1];
    return {
      entity: s.entity,
      byteStart: s.byteStart,
      byteEnd: s.byteEnd,
      utf16Start: u0,
      utf16End: u1,
      text: text.slice(u0, u1),
    };
  });
}

export function redact(text, spans, mask = "█") {
  const ordered = [...spans].sort((a, b) => b.utf16Start - a.utf16Start);
  let out = text;
  for (const s of ordered) {
    const nCodePoints = [...out.slice(s.utf16Start, s.utf16End)].length;
    out = out.slice(0, s.utf16Start) + mask.repeat(nCodePoints) + out.slice(s.utf16End);
  }
  return out;
}

export function toxicity(jigsawLogits, labels, thresholds) {
  const out = {};
  labels.forEach((lb, i) => {
    const p = 1 / (1 + Math.exp(-jigsawLogits[i]));
    out[lb] = { prob: p, flagged: p >= (thresholds?.[lb] ?? 0.5) };
  });
  return out;
}
