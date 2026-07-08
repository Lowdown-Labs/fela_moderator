# Hybrid Engine — Plan 2: `moderate()` pipeline, explainability, validation adapters

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assemble the normalization + detectors (Plan 1) and the neural model into one explainable `moderate(text) -> ModerationResult`, with a config-driven head registry, an English `explain()`, zero-dep Standard-Schema/Zod validation adapters, and a `check()` adapter that keeps the existing DevEx layer green — plus a per-head/per-tool latency benchmark.

**Architecture:** `moderate()` is **sync** and takes a *resolved* `neural` object (or `null`); it runs the detector dual-pass (raw always; normalized only when the materiality gate fires), merges with the model's reasons (PII dedupe prefers the validated rule span; corroboration boosts model score), and filters everything through the head registry so disabled heads never appear. `moderateAsync()` wraps it for an async model. `check()` maps the result back to the two-knob `Finding[]`.

**Tech Stack:** Zero-build ESM (`.mjs` + JSDoc). Depends on Plan 1 (`normalize.mjs`, `detectors/index.mjs`) and existing `reference/checkers.mjs` (`MODEL_OWNED`). Validation adapters are zero-dep (implement the `~standard` object shape). Tests: `node <file>.test.mjs`.

## Global Constraints

- **`moderate()` is synchronous;** `neural` is a resolved object `{ toxicity?, taxonomy?, pii?, <scalarHead>? }` or `null`. Detectors are sub-millisecond, so the model call is the only async work and it happens in the caller (`moderateAsync` orchestrates it).
- **The model always runs on RAW text** (decided in the spec) — so model PII spans are already original-coord; no remap. The materiality gate only governs the *detector* dual-pass.
- **Disabled heads produce zero output** — enforced for rule heads (via the detector `enabled` map) and model heads (checked in `modelReasons`).
- **`Reason` and `ModerationResult` ship exactly as specified.** Internal bookkeeping fields (`_head`, `_category`) are stripped before results are returned.
- **Zero network on the user-data path.** No detector or adapter does I/O.
- **The existing `reference/validate.test.mjs` and the full React/web/CLI suite must stay green.**

---

### Task 1: `Reason` + `ModerationResult` types + neural output type

**Files:**
- Modify: `react/types.ts` (append the new types)
- Test: `react/types.test.ts` (append a type-usage assertion)

**Interfaces:**
- Produces (from `react/types.ts`): `ReasonSource`, `Reason`, `PiiSpan`, `ModerationResult`, and an
  extended `NeuralOut` used by the engine.

- [ ] **Step 1: Append the failing test** to `react/types.test.ts`:

```ts
import type { Reason, ModerationResult } from "./types";

describe("explainability types", () => {
  it("Reason and ModerationResult are usable", () => {
    const r: Reason = { source: "wordlist", detector: "naughty-words:es", label: "slur", span: [12, 18], matched: "x", score: 1, language: "es" };
    const result: ModerationResult = { flagged: true, categories: { profanity: 1 }, piiSpans: [], reasons: [r], normalizedText: "x" };
    expect(result.reasons[0].source).toBe("wordlist");
    expect(result.categories.profanity).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run react/types.test.ts`
Expected: FAIL — `Reason`/`ModerationResult` not exported.

- [ ] **Step 3: Append to `react/types.ts`:**

```ts
export type ReasonSource = "rule" | "wordlist" | "model";
export interface Reason {
  source: ReasonSource;
  detector: string;
  label: string;
  span?: [number, number];   // char offsets INTO THE ORIGINAL text
  matched?: string;
  score?: number;
  language?: string;
}
export interface PiiSpan { entity: string; span: [number, number]; source: string; }
export interface ModerationResult {
  flagged: boolean;
  categories: Record<string, number>;
  piiSpans: PiiSpan[];
  reasons: Reason[];
  normalizedText: string;
}
export interface NeuralOut {
  toxicity?: Record<string, { prob: number; flagged: boolean }>;
  taxonomy?: Record<string, { prob: number; flagged: boolean }>;
  pii?: Array<{ entity: string; text: string; utf16Start: number; utf16End: number; score?: number }>;
  [scalarHead: string]: unknown; // spam_ml / jailbreak / nsfw / target_identity: { prob, flagged }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run react/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add react/types.ts react/types.test.ts
git commit -m "feat(types): Reason, ModerationResult, NeuralOut"
```

---

### Task 2: Head registry (`heads.mjs`)

**Files:**
- Create: `reference/heads.mjs`
- Test: `reference/heads.test.mjs`

**Interfaces:**
- Produces:
  - `DEFAULT_HEADS` — the registry object (see code). Model heads: `jigsaw` (on), `taxonomy` (off,
    weaker/license-gated), `pii_model` (on), and V2 `spam_ml`/`jailbreak`/`nsfw`/`target_identity`
    (all off). Rule heads: `pii_rules` (on), `profanity` (on), `spam` (on).
  - `resolveHeads(overrides?) => Heads` — per-head shallow merge over defaults.
  - `enabledDetectors(heads) => Record<detectorName, boolean>` — a detector is enabled iff its owning
    rule head is enabled. Mapping: `validator/phone/ipaddr/presidio → pii_rules`,
    `profanity/wordlists → profanity`, `spam → spam`.
  - `CATEGORY_HEAD = { pii:"pii_rules", profanity:"profanity", spam:"spam" }` — maps a detector flag's
    `category` to its rule-head name.

- [ ] **Step 1: Write the failing test** — `reference/heads.test.mjs`:

```js
// Run: node reference/heads.test.mjs
import { DEFAULT_HEADS, resolveHeads, enabledDetectors, CATEGORY_HEAD } from "./heads.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

ok(DEFAULT_HEADS.jigsaw.enabled === true, "jigsaw on by default");
ok(DEFAULT_HEADS.taxonomy.enabled === false, "taxonomy off (weaker/license-gated)");
ok(DEFAULT_HEADS.jailbreak.enabled === false && DEFAULT_HEADS.nsfw.enabled === false, "V2 heads pre-registered but off");

const h = resolveHeads({ profanity: { enabled: false } });
ok(h.profanity.enabled === false && h.pii_rules.enabled === true, "override merges per-head");
const en = enabledDetectors(h);
ok(en.profanity === false && en.wordlists === false, "disabling profanity head disables its detectors");
ok(en.validator === true, "unrelated detectors stay enabled");
ok(CATEGORY_HEAD.pii === "pii_rules" && CATEGORY_HEAD.spam === "spam", "category->head map");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node reference/heads.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `reference/heads.mjs`:**

```js
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `node reference/heads.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add reference/heads.mjs reference/heads.test.mjs
git commit -m "feat(engine): config-driven head registry (V2 heads pre-registered disabled)"
```

---

### Task 3: `moderate()` pipeline (`engine.mjs`)

**Files:**
- Create: `reference/engine.mjs`
- Test: `reference/engine.test.mjs`

**Interfaces:**
- Consumes: `normalize`, `skeleton` (Plan 1 `normalize.mjs`); `detect` (Plan 1 `detectors/index.mjs`);
  `resolveHeads`, `enabledDetectors`, `CATEGORY_HEAD`, `SCALAR_HEADS` (`heads.mjs`); `MODEL_OWNED`
  (`checkers.mjs`).
- Produces:
  - `moderate(text, opts?) => ModerationResult`, `opts = { neural?: NeuralOut|null, config?: { heads?, detectorOpts? }, lowercase?: boolean }`.
  - `moderateAsync(text, opts?) => Promise<ModerationResult>`, `opts.neural?: (text)=>Promise<NeuralOut>`.
  - Behavior: materiality gate `skeleton(raw) !== raw` → detector dual-pass; model on raw; PII dedupe
    prefers rule spans; profanity corroboration boosts jigsaw scores; disabled heads emit nothing.

- [ ] **Step 1: Write the failing test** — `reference/engine.test.mjs`:

```js
// Run: node reference/engine.test.mjs
import { moderate } from "./engine.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

// (a) obfuscated PII caught post-normalize, span points at ORIGINAL text
const raw = "mail joe@exＡmple.com now"; // fullwidth A
const r1 = moderate(raw);
const email = r1.reasons.find((x) => x.label === "EMAIL");
ok(email && raw.slice(email.span[0], email.span[1]) === "joe@exＡmple.com", "obfuscated email -> original span");

// (a2) obfuscated profanity (circled letters fold via NFKC)
const r2 = moderate("you ⓕⓤⓒⓚⓔⓡ");
ok(r2.reasons.some((x) => x.label === "profanity"), "circled-letter profanity caught");

// (b) every reason with a span slices to a non-empty original substring
const r3 = moderate("mail joe@example.com call 415-555-2671");
ok(r3.reasons.length > 0 && r3.reasons.every((x) => !x.span || "mail joe@example.com call 415-555-2671".slice(x.span[0], x.span[1]).length > 0), "every span is valid in original text");

// piiSpans populated, source recorded
ok(r3.piiSpans.some((p) => p.entity === "EMAIL" && p.source === "rule"), "piiSpans carry entity+source");

// (d) disabling a rule head removes its reasons
const off = moderate("what the fuck", { config: { heads: { profanity: { enabled: false } } } });
ok(!off.reasons.some((x) => x.label === "profanity"), "disabled profanity head -> no profanity reasons");

// (d2) disabled model head never appears even when neural flags it
const neural = { toxicity: { obscene: { prob: 0.99, flagged: true } } };
const offModel = moderate("hello", { neural, config: { heads: { jigsaw: { enabled: false } } } });
ok(!offModel.reasons.some((x) => x.detector === "model.jigsaw"), "disabled jigsaw head -> no model reasons");

// model jigsaw appears when enabled, contributes a category
const onModel = moderate("hello", { neural });
ok(onModel.reasons.some((x) => x.detector === "model.jigsaw" && x.label === "obscene"), "jigsaw reason present");
ok(onModel.categories.jigsaw >= 0.99, "categories head->max score");

// PII dedupe: a model PII span overlapping a rule PII span is dropped
const dedupe = moderate("call 415-555-2671", { neural: { pii: [{ entity: "LASTNAME", text: "555", utf16Start: 9, utf16End: 12 }] } });
ok(!dedupe.reasons.some((x) => x.label === "LASTNAME"), "model PII overlapping rule PII dropped");

// agreement boost: profanity rule corroborates jigsaw -> boosted score
const boost = moderate("what the fuck", { neural: { toxicity: { obscene: { prob: 0.80, flagged: true } } } });
const jig = boost.reasons.find((x) => x.detector === "model.jigsaw");
ok(jig && jig.score > 0.80, "jigsaw score boosted by profanity corroboration");

// clean text -> not flagged
ok(!moderate("a friendly hello").flagged, "clean -> not flagged");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node reference/engine.test.mjs`
Expected: FAIL — `./engine.mjs` not found.

- [ ] **Step 3: Implement `reference/engine.mjs`:**

```js
// The unified hybrid pipeline: normalize -> [detectors (dual-pass, gated) + model on raw] -> merge ->
// ModerationResult. moderate() is SYNC and takes a resolved neural object; moderateAsync() awaits a
// neural function first. Disabled heads emit nothing. Every span is in ORIGINAL-text coords.
import { normalize, skeleton } from "./normalize.mjs";
import { detect } from "./detectors/index.mjs";
import { resolveHeads, enabledDetectors, CATEGORY_HEAD, SCALAR_HEADS } from "./heads.mjs";
import { MODEL_OWNED } from "./checkers.mjs";

const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1];

/** detector Flag (original coords) -> enriched reason (with _head/_category bookkeeping). */
function flagToReason(f) {
  const r = { source: f.source, detector: f.detector, label: f.label, span: f.span, matched: f.matched, score: f.score, _head: CATEGORY_HEAD[f.category], _category: f.category };
  if (f.language) r.language = f.language;
  return r;
}

/** Model outputs -> enriched reasons, only for enabled model heads. neural is computed on RAW text. */
function modelReasons(neural, heads) {
  const out = [];
  if (heads.jigsaw?.enabled && neural.toxicity) {
    for (const [label, v] of Object.entries(neural.toxicity)) {
      if (v.flagged) out.push({ source: "model", detector: "model.jigsaw", label, score: v.prob, _head: "jigsaw", _category: "jigsaw" });
    }
  }
  if (heads.taxonomy?.enabled && neural.taxonomy) {
    for (const [label, v] of Object.entries(neural.taxonomy)) {
      if (v.flagged || v.prob >= (heads.taxonomy.threshold ?? 0.5)) out.push({ source: "model", detector: "model.taxonomy", label, score: v.prob, _head: "taxonomy", _category: "taxonomy" });
    }
  }
  if (heads.pii_model?.enabled && neural.pii) {
    for (const p of neural.pii) {
      if (!MODEL_OWNED.has(p.entity)) continue; // structured PII belongs to the rules
      out.push({ source: "model", detector: "model.pii", label: p.entity, span: [p.utf16Start, p.utf16End], matched: p.text, score: p.score ?? 1, _head: "pii_model", _category: "pii" });
    }
  }
  for (const name of SCALAR_HEADS) {
    const h = heads[name], v = neural[name];
    if (h?.enabled && v && (v.flagged || v.prob >= (h.threshold ?? 0.5))) out.push({ source: "model", detector: "model." + name, label: name, score: v.prob, _head: name, _category: name });
  }
  return out;
}

/** union dedupe across the raw + normalized detector passes (detector|label|span). */
function dedupeFlags(flags) {
  const seen = new Set(), out = [];
  for (const f of flags) { const k = `${f.detector}|${f.label}|${f.span[0]}|${f.span[1]}`; if (seen.has(k)) continue; seen.add(k); out.push(f); }
  return out;
}

/** PII dedupe (prefer validated rule span) + profanity->jigsaw corroboration boost. */
function mergeReasons(reasons) {
  const rulePII = reasons.filter((r) => r._category === "pii" && r.source === "rule" && r.span);
  let kept = reasons.filter((r) => {
    if (r.source === "model" && r._category === "pii" && r.span) return !rulePII.some((rr) => overlaps(rr.span, r.span));
    return true;
  });
  if (kept.some((r) => r._category === "profanity")) {
    kept = kept.map((r) => (r._head === "jigsaw" ? { ...r, score: 1 - (1 - (r.score ?? 0)) * (1 - 0.5) } : r));
  }
  return kept;
}

function assemble(reasons, normalizedText) {
  const categories = {};
  for (const r of reasons) { if (r._head) categories[r._head] = Math.max(categories[r._head] ?? 0, r.score ?? 1); }
  const piiSpans = reasons.filter((r) => r._category === "pii" && r.span).map((r) => ({ entity: r.label, span: r.span, source: r.source }));
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
  const material = skeleton(raw) !== raw;                 // gate: only obfuscated input pays the 2nd pass
  const { normalized, map } = normalize(raw, { lowercase });
  let flags = detect(raw, { enabled, detectorOpts });     // raw pass always
  if (material) flags = dedupeFlags([...flags, ...detect(normalized, { map, enabled, detectorOpts })]);
  const reasons = flags.map(flagToReason);
  if (neural) reasons.push(...modelReasons(neural, heads));
  return assemble(mergeReasons(reasons), normalized);
}

/** Async convenience: awaits a neural FUNCTION on raw text, then runs the sync pipeline. */
export async function moderateAsync(raw, { neural, ...rest } = {}) {
  let n = null;
  if (typeof neural === "function") { try { n = await neural(raw); } catch { n = null; } } // fail-open
  return moderate(raw, { ...rest, neural: n });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node reference/engine.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add reference/engine.mjs reference/engine.test.mjs
git commit -m "feat(engine): moderate() hybrid pipeline (gate, dual-pass, merge, head filter)"
```

---

### Task 4: `explain()` + `explainReason()` (`explain.mjs`)

**Files:**
- Create: `reference/explain.mjs`
- Test: `reference/explain.test.mjs`

**Interfaces:**
- Produces:
  - `explainReason(reason) => string` — one reason in plain English.
  - `explain(result) => string` — the whole result; `"No moderation flags."` when not flagged.

- [ ] **Step 1: Write the failing test** — `reference/explain.test.mjs`:

```js
// Run: node reference/explain.test.mjs
import { explain, explainReason } from "./explain.mjs";
import { moderate } from "./engine.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

const s = explainReason({ source: "wordlist", detector: "naughty-words:pt", label: "slur", span: [12, 18], matched: "xxx", score: 1, language: "pt" });
ok(s.includes("slur") && s.includes("wordlist") && s.includes("pt"), "reason mentions label/source/language");
ok(s.includes("12") && s.includes("18"), "reason mentions the char span");

const model = explainReason({ source: "model", detector: "model.jigsaw", label: "harassment", score: 0.91 });
ok(model.includes("harassment") && model.includes("model") && model.includes("0.91"), "model reason mentions score");

const r = moderate("mail joe@example.com");
ok(explain(r).startsWith("Flagged") && explain(r).includes("EMAIL"), "explain(result) summarizes flags");
ok(explain(moderate("a friendly hello")) === "No moderation flags.", "clean -> no-flags string");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node reference/explain.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `reference/explain.mjs`:**

```js
// Human-readable "why": render structured Reasons as plain English. Pure, no dependencies.
/** @param {import("../react/types").Reason} r */
export function explainReason(r) {
  const lang = r.language ? ":" + r.language : "";
  const score = r.score != null ? ", " + r.score.toFixed(2) : "";
  const where = r.span ? ` at chars ${r.span[0]}–${r.span[1]}` : "";
  const matched = r.matched ? ` '${r.matched}'` : "";
  return `${r.label} (${r.source}${lang}${score}) via ${r.detector}${matched}${where}`;
}

/** @param {import("../react/types").ModerationResult} result */
export function explain(result) {
  if (!result.flagged) return "No moderation flags.";
  return "Flagged " + result.reasons.map(explainReason).join("; ") + ".";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node reference/explain.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add reference/explain.mjs reference/explain.test.mjs
git commit -m "feat(explain): explain()/explainReason() plain-English rendering"
```

---

### Task 5: Validation adapters (`schema.mjs`) — Standard Schema + Zod

**Files:**
- Create: `reference/schema.mjs`
- Test: `reference/schema.test.mjs`

**Interfaces:**
- Consumes: `moderate` (`engine.mjs`), `explainReason` (`explain.mjs`).
- Produces (zero-dep):
  - `moderationSchema(opts?) => StandardSchemaV1` — object with `~standard.validate(value)` returning
    `{ issues:[{message}] }` when flagged, else `{ value }`. Drops into Zod/Valibot/ArkType and any
    `@hookform/resolvers` Standard-Schema resolver.
  - `zodRefine(opts?) => (value, ctx) => void` — a `superRefine` callback; emits
    `ctx.addIssue({ code:"custom", message })` per reason. No `zod` import.

- [ ] **Step 1: Write the failing test** — `reference/schema.test.mjs`:

```js
// Run: node reference/schema.test.mjs
import { moderationSchema, zodRefine } from "./schema.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

const schema = moderationSchema();
ok(schema["~standard"].version === 1 && schema["~standard"].vendor === "lowdown-moderate", "standard-schema shape");
const bad = schema["~standard"].validate("mail joe@example.com");
ok(Array.isArray(bad.issues) && bad.issues[0].message.includes("EMAIL"), "flagged -> issues with a why");
const good = schema["~standard"].validate("a friendly hello");
ok(good.value === "a friendly hello" && !good.issues, "clean -> { value }");

// zodRefine emits one custom issue per reason
const issues = [];
zodRefine()("mail joe@example.com", { addIssue: (i) => issues.push(i) });
ok(issues.length >= 1 && issues[0].code === "custom" && issues[0].message.includes("EMAIL"), "zodRefine adds custom issues");
const none = [];
zodRefine()("a friendly hello", { addIssue: (i) => none.push(i) });
ok(none.length === 0, "clean -> no zod issues");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node reference/schema.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `reference/schema.mjs`:**

```js
// Validation adapters: make moderation ONE rule in the form stack devs already use. Implements the
// Standard Schema `~standard` interface (works with Zod/Valibot/ArkType — needs NO dependency) plus a
// Zod superRefine callback. Both map each Reason's plain-English "why" into the host library's issues.
import { moderate } from "./engine.mjs";
import { explainReason } from "./explain.mjs";

/** A Standard Schema (standardschema.dev) that fails a string when moderation flags it. */
export function moderationSchema(opts = {}) {
  return {
    "~standard": {
      version: 1,
      vendor: "lowdown-moderate",
      validate(value) {
        const text = typeof value === "string" ? value : String(value ?? "");
        const r = moderate(text, opts);
        if (r.flagged) return { issues: r.reasons.map((reason) => ({ message: explainReason(reason) })) };
        return { value: text };
      },
    },
  };
}

/** A Zod `superRefine` callback: `z.string().superRefine(zodRefine(opts))`. No zod import needed. */
export function zodRefine(opts = {}) {
  return (value, ctx) => {
    const r = moderate(String(value ?? ""), opts);
    for (const reason of r.reasons) ctx.addIssue({ code: "custom", message: explainReason(reason) });
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node reference/schema.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add reference/schema.mjs reference/schema.test.mjs
git commit -m "feat(schema): zero-dep Standard Schema + Zod validation adapters"
```

---

### Task 6: Refactor `check()` over `moderate()` (keep the DevEx layer green)

**Files:**
- Modify: `reference/validate.mjs` (rewrite `check`; keep `maskValue`/`redactText`/`DEFAULT_POLICY`)

**Interfaces:**
- Consumes: `moderate` (`engine.mjs`); existing `maskValue` in the same file.
- Produces: unchanged public signature `check(text, { neural?, policy? }) => { findings, blocked, warned }`.
  Mapping: a reason whose `(label, span)` is in `result.piiSpans` → `Finding.category:"pii"`; otherwise
  `"toxicity"`. `Reason.source==="model"` → `Finding.source:"model"`, else `"regex"`. Severity from the
  two-knob policy.

- [ ] **Step 1: Update the top of `reference/validate.mjs`** — add the import and replace the `check`
  function body (keep `DEFAULT_POLICY`, `maskValue`, `redactText` exactly as they are). Replace the
  existing `export function check(...) {...}` with:

```js
import { moderate } from "./engine.mjs";

/**
 * Two-knob gate, now a thin adapter over the explainable engine.
 * @param {string} text
 * @param {{ neural?: any, policy?: Policy }} [opts]
 * @returns {{ findings: Finding[], blocked: boolean, warned: boolean }}
 */
export function check(text, { neural = null, policy = DEFAULT_POLICY } = {}) {
  const pol = { ...DEFAULT_POLICY, ...policy };
  const result = moderate(text, { neural });
  const piiKey = new Set(result.piiSpans.map((p) => `${p.entity}|${p.span[0]}|${p.span[1]}`));
  const findings = result.reasons.map((r) => {
    const isPII = r.span ? piiKey.has(`${r.label}|${r.span[0]}|${r.span[1]}`) : false;
    const category = isPII ? "pii" : "toxicity";
    const finding = {
      category,
      type: r.label,
      severity: category === "pii" ? pol.pii : pol.toxicity,
      text: r.matched || "",
      start: r.span ? r.span[0] : -1,
      end: r.span ? r.span[1] : -1,
      source: r.source === "model" ? "model" : "regex",
    };
    if (isPII) finding.suggestion = maskValue(finding);
    return finding;
  });
  const blocked = findings.some((f) => f.severity === "block");
  const warned = findings.some((f) => f.severity === "warn");
  return { findings, blocked, warned };
}
```

Put the `import { moderate }` line with the other imports at the top of the file. Delete the old
`check` implementation (the one that read `structuredPII`/`neural.pii`/`neural.toxicity` directly). Keep
the `import { MODEL_OWNED, structuredPII } from "./checkers.mjs";` line only if still referenced — after
this change `structuredPII` is no longer used here, so remove `structuredPII` from that import (keep the
file importing nothing unused).

- [ ] **Step 2: Run the existing gate tests to verify they still pass**

Run: `node reference/validate.test.mjs`
Expected: `ALL PASS` (the pre-existing assertions: email→blocked/EMAIL/regex, phone warn, off silent,
neural obscene→toxicity, model FIRSTNAME kept, model EMAIL dropped, regex email kept, redaction).

- [ ] **Step 3: Run the React/web/CLI suite to verify no regressions**

Run: `npx vitest run`
Expected: PASS (all existing suites — `useModeration`, `ModeratedTextarea`, web component, CLI).

- [ ] **Step 4: Commit**

```bash
git add reference/validate.mjs
git commit -m "refactor(core): check() is now a thin adapter over moderate()"
```

---

### Task 7: Exports, type declarations, and the per-head/per-tool benchmark

**Files:**
- Create: `reference/bench.mjs`
- Create: `reference/engine.d.ts`
- Modify: `reference/validate.mjs` (re-export `moderate`, `explain`)
- Modify: `package.json` (add `./engine`, `./schema`, `./explain` exports; add `bench` + engine tests to scripts; add new files to `files`)

**Interfaces:**
- Produces:
  - Main entry re-exports so `import { moderate, explain } from "@lowdown/moderate"` works.
  - `reference/engine.d.ts` — typed signatures for `moderate`, `moderateAsync`.
  - `bench.mjs` — prints p50/p95 per detector (per-tool), for `normalize()`, and for `moderate()`
    end-to-end (model-off), over a fixed corpus. Exits 0.

- [ ] **Step 1: Write the failing test for the benchmark** — `reference/bench.test.mjs`:

```js
// Run: node reference/bench.test.mjs
import { runBench } from "./bench.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

const report = runBench({ iterations: 20 });
ok(report.tools.validator && typeof report.tools.validator.p50 === "number", "per-tool p50 present");
ok(typeof report.normalize.p95 === "number", "normalize timing present");
ok(typeof report.moderate.p50 === "number", "moderate end-to-end timing present");
ok(Object.keys(report.tools).length === 7, "all seven detectors timed individually");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node reference/bench.test.mjs`
Expected: FAIL — `./bench.mjs` not found.

- [ ] **Step 3: Implement `reference/bench.mjs`:**

```js
// Per-tool / per-gate latency benchmark. Reports p50/p95 (ms) for each detector individually, for
// normalize(), and for moderate() end-to-end (model-off). Feeds the head registry: a tool that costs
// too much for its signal ships enabled:false. Run directly (`node reference/bench.mjs`) to print a table.
import { performance } from "node:perf_hooks";
import { normalize } from "./normalize.mjs";
import { DETECTORS } from "./detectors/index.mjs";
import { moderate } from "./engine.mjs";

const CORPUS = [
  "just a friendly hello there, nice to meet you",
  "mail joe@example.com or call 415-555-2671 today",
  "you ⓕⓤⓒⓚⓔⓡ and visit bit.ly/abc for a free prize",
  "server 192.168.0.1 ssn 123-45-6789 iban GB82WEST12345698765432",
  "hola amigo, una frase con contenido en varios idiomas",
];

function stats(times) {
  const s = [...times].sort((a, b) => a - b);
  const at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { p50: +at(0.5).toFixed(4), p95: +at(0.95).toFixed(4) };
}

function time(fn, iterations) {
  const times = [];
  for (let i = 0; i < iterations; i++) { const t0 = performance.now(); for (const c of CORPUS) fn(c); times.push((performance.now() - t0) / CORPUS.length); }
  return stats(times);
}

/** @param {{ iterations?: number }} [opts] */
export function runBench({ iterations = 200 } = {}) {
  const tools = {};
  for (const d of DETECTORS) tools[d.name] = time((c) => d.detect(c), iterations);
  return {
    tools,
    normalize: time((c) => normalize(c), iterations),
    moderate: time((c) => moderate(c), iterations),
  };
}

// Direct run: print a table.
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = runBench();
  console.log("tool           p50(ms)  p95(ms)");
  for (const [name, s] of Object.entries(r.tools)) console.log(name.padEnd(14), String(s.p50).padStart(7), String(s.p95).padStart(8));
  console.log("normalize".padEnd(14), String(r.normalize.p50).padStart(7), String(r.normalize.p95).padStart(8));
  console.log("moderate".padEnd(14), String(r.moderate.p50).padStart(7), String(r.moderate.p95).padStart(8));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node reference/bench.test.mjs && node reference/bench.mjs`
Expected: `ALL PASS`, then a printed timing table.

- [ ] **Step 5: Re-export from the main entry.** At the bottom of `reference/validate.mjs` add:

```js
export { moderate, moderateAsync } from "./engine.mjs";
export { explain, explainReason } from "./explain.mjs";
export { moderationSchema, zodRefine } from "./schema.mjs";
```

- [ ] **Step 6: Create `reference/engine.d.ts`:**

```ts
import type { ModerationResult, NeuralOut } from "../react/types";
export interface ModerateOpts { neural?: NeuralOut | null; config?: { heads?: Record<string, { enabled?: boolean; threshold?: number | null }>; detectorOpts?: Record<string, unknown> }; lowercase?: boolean; }
export function moderate(text: string, opts?: ModerateOpts): ModerationResult;
export function moderateAsync(text: string, opts?: Omit<ModerateOpts, "neural"> & { neural?: (text: string) => Promise<NeuralOut> }): Promise<ModerationResult>;
```

- [ ] **Step 7: Update `package.json`.** Add exports and scripts, and list the new files. Merge:

```json
{
  "exports": {
    ".": "./reference/validate.mjs",
    "./gate": "./reference/validate.mjs",
    "./moderate": "./reference/moderate.mjs",
    "./engine": "./reference/engine.mjs",
    "./schema": "./reference/schema.mjs",
    "./explain": "./reference/explain.mjs",
    "./checkers": "./reference/checkers.mjs",
    "./model/runner.mjs": "./model/runner.mjs",
    "./react": "./react/index.ts",
    "./web": "./web/fela-moderated-input.js",
    "./config.json": "./config.json"
  },
  "scripts": {
    "test": "npm run test:detectors && node reference/heads.test.mjs && node reference/engine.test.mjs && node reference/explain.test.mjs && node reference/schema.test.mjs && node reference/bench.test.mjs && node reference/validate.test.mjs && vitest run",
    "test:detectors": "node reference/normalize.test.mjs && node reference/detectors/validator.test.mjs && node reference/detectors/phone.test.mjs && node reference/detectors/ipaddr.test.mjs && node reference/detectors/presidio.test.mjs && node reference/detectors/profanity.test.mjs && node reference/detectors/wordlists.test.mjs && node reference/detectors/spam.test.mjs && node reference/detectors/index.test.mjs",
    "bench": "node reference/bench.mjs"
  }
}
```

Ensure `reference/*.mjs`, `reference/*.d.ts`, and `reference/detectors/*.mjs` are covered by the `files`
array (add `"reference/detectors/*.mjs"`).

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: every detector + engine + explain + schema + gate suite prints `ALL PASS`, and vitest is green.

- [ ] **Step 9: Commit**

```bash
git add reference/bench.mjs reference/bench.test.mjs reference/engine.d.ts reference/validate.mjs package.json
git commit -m "feat(engine): exports, engine .d.ts, per-tool/per-gate bench, full-suite wiring"
```

---

## Self-Review

**Spec coverage (Task 3 + Task 4 + validation adapters + performance of the design spec):**
- `moderate()` normalize → gate → dual-pass detect → model-on-raw → merge → `ModerationResult` → Task 3. ✓
- Head registry, disabled heads emit nothing, V2 heads pre-registered disabled → Tasks 2–3. ✓
- Merge policy (PII dedupe prefers rule span; profanity→jigsaw corroboration boost) → Task 3. ✓
- `Reason`/`ModerationResult` exactly as specified → Task 1. ✓
- `explain()`/`explainReason()` → Task 4. ✓
- Validation adapters (Standard Schema + Zod, zero-dep) → Task 5. ✓
- `check()` adapter keeps the DevEx layer green → Task 6. ✓
- Per-head/per-tool latency benchmark → Task 7. ✓
- Exports + `.d.ts` + full-suite wiring → Task 7. ✓

**Placeholder scan:** every step shows full code, exact command, expected output. No TBD/TODO. ✓

**Type consistency:** `Reason`/`ModerationResult`/`NeuralOut` (Task 1) match `engine.mjs`'s output
(Task 3), `explain.mjs`'s input (Task 4), `schema.mjs` (Task 5), the `check()` mapping (Task 6), and
`engine.d.ts` (Task 7). `resolveHeads`/`enabledDetectors`/`CATEGORY_HEAD`/`SCALAR_HEADS` (Task 2) are
consumed with matching names in Task 3. `DETECTORS` (Plan 1 Task 9) is consumed by the bench (Task 7). ✓

**Note for the implementer:** the internal enriched-reason fields `_head`/`_category` exist only inside
`engine.mjs` and are stripped in `assemble()`; the returned `reasons` conform to the `Reason` interface.
