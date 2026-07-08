// The unified hybrid pipeline: normalize -> [detectors (dual-pass, gated) + model on raw] -> merge ->
// ModerationResult. moderate() is SYNC and takes a resolved neural object. moderateAsync() awaits a
// neural function first. Disabled heads emit nothing. Every span is in ORIGINAL-text coords.
import { normalize, skeleton } from "./normalize.mjs";
import { detect } from "./detectors/index.mjs";
import { resolveHeads, enabledDetectors, CATEGORY_HEAD, SCALAR_HEADS } from "./heads.mjs";
import { MODEL_OWNED } from "./checkers.mjs";

const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1];

/** detector Flag (original coords) -> enriched reason (with _head/_category bookkeeping). */
function flagToReason(f) {
  const r = {
    source: f.source,
    detector: f.detector,
    label: f.label,
    span: f.span,
    matched: f.matched,
    score: f.score,
    _head: CATEGORY_HEAD[f.category],
    _category: f.category,
  };
  if (f.language) r.language = f.language;
  return r;
}

/** Model outputs -> enriched reasons, only for enabled model heads. neural is computed on RAW text. */
function modelReasons(neural, heads) {
  const out = [];
  if (heads.jigsaw?.enabled && neural.toxicity) {
    for (const [label, v] of Object.entries(neural.toxicity)) {
      if (v.flagged)
        out.push({
          source: "model",
          detector: "model.jigsaw",
          label,
          score: v.prob,
          _head: "jigsaw",
          _category: "jigsaw",
        });
    }
  }
  if (heads.taxonomy?.enabled && neural.taxonomy) {
    for (const [label, v] of Object.entries(neural.taxonomy)) {
      if (v.flagged || v.prob >= (heads.taxonomy.threshold ?? 0.5))
        out.push({
          source: "model",
          detector: "model.taxonomy",
          label,
          score: v.prob,
          _head: "taxonomy",
          _category: "taxonomy",
        });
    }
  }
  if (heads.pii_model?.enabled && neural.pii) {
    for (const p of neural.pii) {
      if (!MODEL_OWNED.has(p.entity)) continue; // structured PII belongs to the rules
      out.push({
        source: "model",
        detector: "model.pii",
        label: p.entity,
        span: [p.utf16Start, p.utf16End],
        matched: p.text,
        score: p.score ?? 1,
        _head: "pii_model",
        _category: "pii",
      });
    }
  }
  for (const name of SCALAR_HEADS) {
    const h = heads[name],
      v = neural[name];
    if (h?.enabled && v && (v.flagged || v.prob >= (h.threshold ?? 0.5)))
      out.push({
        source: "model",
        detector: "model." + name,
        label: name,
        score: v.prob,
        _head: name,
        _category: name,
      });
  }
  return out;
}

/** union dedupe across the raw + normalized detector passes (detector|label|span). */
function dedupeFlags(flags) {
  const seen = new Set(),
    out = [];
  for (const f of flags) {
    const k = `${f.detector}|${f.label}|${f.span[0]}|${f.span[1]}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

/** PII dedupe (prefer validated rule span) + profanity->jigsaw corroboration boost. */
function mergeReasons(reasons) {
  const rulePII = reasons.filter((r) => r._category === "pii" && r.source === "rule" && r.span);
  let kept = reasons.filter((r) => {
    if (r.source === "model" && r._category === "pii" && r.span)
      return !rulePII.some((rr) => overlaps(rr.span, r.span));
    return true;
  });
  if (kept.some((r) => r._category === "profanity")) {
    kept = kept.map((r) => (r._head === "jigsaw" ? { ...r, score: 1 - (1 - (r.score ?? 0)) * (1 - 0.5) } : r));
  }
  return kept;
}

function assemble(reasons, normalizedText) {
  const categories = {};
  for (const r of reasons) {
    if (r._head) categories[r._head] = Math.max(categories[r._head] ?? 0, r.score ?? 1);
  }
  const piiSpans = reasons
    .filter((r) => r._category === "pii" && r.span)
    .map((r) => ({ entity: r.label, span: r.span, source: r.source }));
  const clean = reasons.map(({ _head, _category, ...rest }) => rest);
  return { flagged: clean.length > 0, categories, piiSpans, reasons: clean, normalizedText };
}

/**
 * @param {string} raw
 * @param {{ neural?: object|null, config?: { heads?: object, detectorOpts?: object }, lowercase?: boolean }} [opts]
 * @returns {import("../react/types").ModerationResult}
 */
export function moderate(raw, { neural = null, config = {}, lowercase = false } = {}) {
  const heads = resolveHeads(config.heads);
  const enabled = enabledDetectors(heads);
  const detectorOpts = config.detectorOpts || {};
  const material = skeleton(raw) !== raw; // gate: only obfuscated input pays the 2nd pass
  const { normalized, map } = normalize(raw, { lowercase });
  let flags = detect(raw, { enabled, detectorOpts }); // raw pass always
  if (material) flags = dedupeFlags([...flags, ...detect(normalized, { map, enabled, detectorOpts })]);
  const reasons = flags.map(flagToReason);
  if (neural) reasons.push(...modelReasons(neural, heads));
  return assemble(mergeReasons(reasons), normalized);
}

/** Async convenience: awaits a neural FUNCTION on raw text, then runs the sync pipeline. */
export async function moderateAsync(raw, { neural, ...rest } = {}) {
  let n = null;
  if (typeof neural === "function") {
    try {
      n = await neural(raw);
    } catch {
      n = null;
    }
  } // fail-open
  return moderate(raw, { ...rest, neural: n });
}
