export const DEFAULT_HEADS = {
  jigsaw: { kind: "model", enabled: true, threshold: null },
  pii_model: { kind: "model", enabled: true, threshold: null },
  spam_ml: { kind: "model", enabled: true, threshold: null },

  pii_rules: { kind: "rule", enabled: true },
  profanity: { kind: "rule", enabled: true },
  spam: { kind: "rule", enabled: true },
};

const DETECTOR_HEAD = {
  validator: "pii_rules",
  phone: "pii_rules",
  ipaddr: "pii_rules",
  presidio: "pii_rules",
  profanity: "profanity",
  wordlists: "profanity",
  spam: "spam",
};
export const CATEGORY_HEAD = { pii: "pii_rules", profanity: "profanity", spam: "spam" };
export const SCALAR_HEADS = ["spam_ml"];

export function resolveHeads(overrides = {}) {
  const out = {};
  for (const [k, v] of Object.entries(DEFAULT_HEADS)) out[k] = { ...v, ...(overrides[k] || {}) };
  for (const [k, v] of Object.entries(overrides)) if (!out[k]) out[k] = { ...v };
  return out;
}

export function enabledDetectors(heads) {
  const out = {};
  for (const [det, head] of Object.entries(DETECTOR_HEAD)) out[det] = heads[head]?.enabled !== false;
  return out;
}
