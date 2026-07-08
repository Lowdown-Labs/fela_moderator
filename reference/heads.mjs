// Config-driven head registry. moderate() emits ONLY from enabled heads. Rule heads gate the
// deterministic detectors; model heads gate the neural outputs. New V2 model heads are pre-registered
// disabled so they slot in with a single `enabled: true` once they pass the eval gate — no code change.
export const DEFAULT_HEADS = {
  // model heads
  jigsaw:          { kind: "model", enabled: true,  threshold: null }, // per-label thresholds from config.json
  taxonomy:        { kind: "model", enabled: false, threshold: 0.5 },  // weaker (val AUROC ~0.93), license-gated
  pii_model:       { kind: "model", enabled: true,  threshold: null }, // unstructured PII (names/addresses)
  spam_ml:         { kind: "model", enabled: false, threshold: 0.5 },
  jailbreak:       { kind: "model", enabled: false, threshold: 0.5 },
  nsfw:            { kind: "model", enabled: false, threshold: 0.5 },
  target_identity: { kind: "model", enabled: false, threshold: 0.5 },
  // rule heads (own the deterministic detectors)
  pii_rules:       { kind: "rule", enabled: true },
  profanity:       { kind: "rule", enabled: true },
  spam:            { kind: "rule", enabled: true },
};

const DETECTOR_HEAD = { validator: "pii_rules", phone: "pii_rules", ipaddr: "pii_rules", presidio: "pii_rules", profanity: "profanity", wordlists: "profanity", spam: "spam" };
export const CATEGORY_HEAD = { pii: "pii_rules", profanity: "profanity", spam: "spam" };
export const SCALAR_HEADS = ["spam_ml", "jailbreak", "nsfw", "target_identity"];

/** Per-head shallow merge of overrides over the defaults. */
export function resolveHeads(overrides = {}) {
  const out = {};
  for (const [k, v] of Object.entries(DEFAULT_HEADS)) out[k] = { ...v, ...(overrides[k] || {}) };
  for (const [k, v] of Object.entries(overrides)) if (!out[k]) out[k] = { ...v };
  return out;
}

/** A detector is enabled iff its owning rule head is enabled. */
export function enabledDetectors(heads) {
  const out = {};
  for (const [det, head] of Object.entries(DETECTOR_HEAD)) out[det] = heads[head]?.enabled !== false;
  return out;
}
