// FELA-moderator on-device post-processing — reference implementation (TypeScript/JS).
// Portable: uses TextEncoder (Node 18+ and all browsers). The model is byte-level, so the tokenizer
// IS the UTF-8 bytes — no vocab file. This module turns raw model outputs into toxicity flags and
// PII redactions, and (the fiddly part) maps per-BYTE PII spans back to native UTF-16 string indices.
//
// Contract (see ../SPEC.md): input_ids int32[1,512] = [CLS=257, b0, b1, ...] (bytes 0-255, PAD=256),
// outputs raw logits taxonomy[11], jigsaw[6], pii[512,113]. Token t (t>=1) corresponds to UTF-8 byte
// (t-1) of the (truncated) input; token 0 is CLS.

export const PAD_ID = 256, CLS_ID = 257, SEP_ID = 258, MAX_LEN = 512;
const ENC = new TextEncoder();

/** Byte-tokenize one string into the model's input ids (padded to maxLen) + the byte index each
 *  token maps to (-1 for CLS/PAD). Matches modeling.py encode_text/pad_batch. */
export function encodeText(text, maxLen = MAX_LEN) {
  const bytes = ENC.encode(text);
  const ids = new Int32Array(maxLen).fill(PAD_ID);
  const byteOfToken = new Int32Array(maxLen).fill(-1);
  ids[0] = CLS_ID;
  const n = Math.min(bytes.length, maxLen - 1);
  for (let j = 0; j < n; j++) { ids[j + 1] = bytes[j]; byteOfToken[j + 1] = j; }
  return { ids, byteOfToken, nBytes: bytes.length, nTokens: n + 1 };
}

/** For every UTF-8 byte offset of `text`, the containing character's [startUtf16, endUtf16). This is
 *  the byte->UTF-16 bridge: a char is 1-4 bytes and 1-2 UTF-16 code units (2 for astral/emoji). */
export function charBoundsByByte(text) {
  const startOf = [], endOf = [];
  let u = 0;
  for (const ch of text) {                 // iterates by code point
    const bl = ENC.encode(ch).length;      // 1..4 UTF-8 bytes
    const cu = ch.length;                  // 1 or 2 UTF-16 code units
    for (let b = 0; b < bl; b++) { startOf.push(u); endOf.push(u + cu); }
    u += cu;
  }
  return { startOf, endOf, totalUtf16: u };
}

/** Per-token PII BIO tag ids -> merged entity spans -> byte ranges -> native UTF-16 ranges.
 *  `argmaxPerToken[t]` is the argmax of pii[t] (0..112); `piiTags` is config.json.pii_tags (113). */
export function piiSpans(argmaxPerToken, byteOfToken, piiTags, text) {
  const cb = charBoundsByByte(text);
  const raw = [];
  let cur = null;
  const flush = () => { if (cur) { raw.push(cur); cur = null; } };
  for (let t = 1; t < argmaxPerToken.length; t++) {   // skip CLS
    const byte = byteOfToken[t];
    if (byte < 0) { continue; }                        // PAD
    const tag = piiTags[argmaxPerToken[t]] || "O";
    if (tag === "O") { flush(); continue; }
    const dash = tag.indexOf("-");
    const bio = tag.slice(0, dash), ent = tag.slice(dash + 1);
    if (bio === "B" || !cur || cur.entity !== ent) { flush(); cur = { entity: ent, byteStart: byte, byteEnd: byte + 1 }; }
    else { cur.byteEnd = byte + 1; }                   // I- continues
  }
  flush();
  return raw.map((s) => {
    const u0 = cb.startOf[s.byteStart];
    const u1 = cb.endOf[s.byteEnd - 1];                // end of the LAST byte's char (whole-char safe)
    return { entity: s.entity, byteStart: s.byteStart, byteEnd: s.byteEnd, utf16Start: u0, utf16End: u1, text: text.slice(u0, u1) };
  });
}

/** Replace each span's UTF-16 range with a mask (one mask char per code point redacted). */
export function redact(text, spans, mask = "█") {
  const ordered = [...spans].sort((a, b) => b.utf16Start - a.utf16Start); // right-to-left, stable indices
  let out = text;
  for (const s of ordered) {
    const nCodePoints = [...out.slice(s.utf16Start, s.utf16End)].length;
    out = out.slice(0, s.utf16Start) + mask.repeat(nCodePoints) + out.slice(s.utf16End);
  }
  return out;
}

/** Jigsaw toxicity: sigmoid + per-category threshold (config.json.toxicity_thresholds). */
export function toxicity(jigsawLogits, labels, thresholds) {
  const out = {};
  labels.forEach((lb, i) => {
    const p = 1 / (1 + Math.exp(-jigsawLogits[i]));
    out[lb] = { prob: p, flagged: p >= (thresholds?.[lb] ?? 0.5) };
  });
  return out;
}
