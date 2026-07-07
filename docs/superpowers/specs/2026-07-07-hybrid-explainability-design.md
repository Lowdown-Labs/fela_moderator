# FELA Moderator — Hybrid Detectors + Explainability Engine Design

**Date:** 2026-07-07
**Status:** Approved (brainstorm), pending implementation plan
**Companion (prior work):** `docs/superpowers/specs/2026-07-07-devex-layer-design.md`

## Goal

Turn the FELA moderator into a **hybrid, explainable-by-default** content engine:

1. Normalize obfuscated input (NFKC + homoglyph un-mapping) before both rules and model, so
   `Ⅴ1@gⓡ@`-style tricks are defeated — while keeping every emitted span pointed at the user's
   **original** text.
2. Add fast, high-precision, deterministic MIT/permissive detectors alongside the neural model.
3. Merge rules + model into one `ModerationResult` where **every flag carries a structured `Reason`** —
   "why was this moderated" is automatic, structured, and human-readable.
4. Stay lean and fast: measure per-head/per-tool latency so any offender can be disabled and not shipped.

## Hard constraints (unchanged from the SDK charter)

- **MIT/permissive dependencies only.** Reject GPL/AGPL/CC-BY-NC/OpenRAIL. Each dep vetted in `LICENSES.md`.
- **Runs in-browser (WASM/bundled) and in Node.** No server round-trip on the core path.
- **Tokenizer-free / byte-level.** Never add a tokenizer. The model's "tokenizer" is UTF-8 bytes.

## Decisions locked in brainstorm

- **`moderate()` is the engine; `check()` is a thin adapter over it.** One source of truth. The existing
  two-knob DevEx layer (`Finding`, `useModeration`, `<ModeratedTextarea>`, web component, CLI) is
  preserved via a mapping — its whole test suite must stay green.
- **Bundle all vetted detector libs by default.** 300KB is acceptable; if a dep is well-maintained, safe,
  and adds hybrid signal, ship it. Bundle size stays lean by making every detector/head *disableable*
  (see Head Registry + Performance).
- **One spec covers Tasks 1–4** including `<ModerationBadge>` and the README rewrite.
- **The model always sees raw text; rules carry the obfuscation load.** No off-distribution model input.
  No `thorough`/dual-model mode (rejected to avoid configuration noise).
- **Config-driven head registry**, so the V2 model heads (spam-ML, jailbreak, NSFW-severity,
  target-identity) ship pre-registered but `enabled:false` until they pass an eval gate.

---

## Module layout

Keeps the core's zero-build `.mjs` + `.d.ts` convention. New engine files live under `reference/`.

```
reference/
  normalize.mjs        normalize(text,{lowercase}) -> { normalized, map }
  detectors/
    index.mjs          detector registry + detect(text,{map,config}) -> Flag[]
    validator.mjs      validator.js         -> EMAIL, URL, IP, CREDITCARD (+Luhn)
    phone.mjs          google-libphonenumber -> PHONE (parse + isValid, E.164 suggestion)
    ipaddr.mjs         ipaddr.js            -> IPV4/IPV6 validate + classify (private/reserved)
    presidio.mjs       Presidio-style MIT regex patterns -> SSN, IBAN, BIC, BTC/ETH, ...
    profanity.mjs      obscenity + leo-profanity (char-substitution aware) -> profanity/slur
    wordlists.mjs      naughty-words        -> multilingual hits, emits `language`
    spam.mjs           shortener/scam-keyword/URL heuristics (configurable lists)
  engine.mjs           moderate(text, opts) -> ModerationResult  (the merge pipeline)
  heads.mjs            config-driven head registry (enable flags / thresholds / kinds)
  explain.mjs          explain(result) + explainReason(reason)
  bench.mjs            per-head / per-tool latency micro-benchmark
LICENSES.md            per-dependency license vetting table
react/ModerationBadge.tsx   <ModerationBadge result={...}/> — reasons on hover/focus
```

The existing `reference/moderate.mjs` (model post-processing: encode, PII spans, redact) is kept and
reused by `engine.mjs`. The new unified entry is `engine.mjs` to avoid a `moderate.mjs`/`moderate()`
name collision. The main entry (`.` → `reference/validate.mjs`) re-exports `moderate` so
`import { moderate } from "@lowdown/moderate"` works. A new `./engine` export points at `engine.mjs`.

---

## Task 1 — `normalize(text)` + offset map (the correctness keystone)

**Signature:** `normalize(text, { lowercase = false } = {}) -> { normalized: string, map: OffsetMap }`

**Pipeline:** NFKC (`String.prototype.normalize("NFKC")`) → homoglyph un-map (`unhomoglyph`, MIT) →
optional lowercasing. This defeats compat/confusable obfuscation (fullwidth, circled, math-alphanumeric,
Cyrillic/Greek look-alikes).

**Offset map** is built **code-point by code-point**: iterate the original by code point; normalize each
code point individually to a (possibly multi-unit) chunk; for every resulting normalized UTF-16 unit,
record the source original `[start, end)` range. The map exposes:

- `map.toOriginal(nStart, nEnd) -> [origStart, origEnd]` — maps a span in **normalized** coords back to
  **original** coords, always covering **whole original characters** (min start / max end over covered
  units). Mirrors the existing `charBoundsByByte` technique in `reference/moderate.mjs`.

**Why this shape:** rejected diff-based alignment as overkill. Documented limitation: cross-boundary
combining-mark sequences (rare) aren't perfectly aligned; all obfuscation cases in scope are
per-code-point transforms, so they map exactly.

Every detector — and every span produced anywhere — passes through `map.toOriginal` before it reaches a
`Reason`, guaranteeing deliverable (b): spans point into the original text.

---

## Task 2 — deterministic detectors behind a common `detect()`

**Detector contract.** Each adapter is `{ name, kind:"rule"|"wordlist", detect(text) -> RawFlag[] }`
returning matches in the coords of the text it was handed. `detect(text, { map, config })` in
`detectors/index.mjs` runs all **enabled** detectors and returns `Flag[]` with spans already mapped to
original coords:

```ts
Flag = {
  source: "rule" | "wordlist",
  detector: string,          // "validator.email", "naughty-words:es", "spam.shortener"
  label: string,             // "EMAIL", "PHONE", "harassment", "SSN"
  span: [number, number],    // ORIGINAL coords
  matched: string,           // exact substring / keyword that fired
  score: number,             // 1.0 for a hard rule
  language?: string,         // wordlist hits only
  category: "pii" | "profanity" | "spam"
}
```

**Hybrid extract-then-validate for structured PII** (the precision win over today's raw regex): regex
extracts candidate substrings (exact spans), then the MIT validator confirms and kills false positives.

- `validator.mjs` (validator.js, MIT): `isEmail`, `isURL`, `isIP`, `isCreditCard` (Luhn) over extracted
  candidates; emits exact spans.
- `phone.mjs` (google-libphonenumber, Apache-2.0): extract phone-ish candidates → `parse` +
  `isValidNumber` (region configurable, default via leading `+`/US); emits E.164 as `suggestion`.
  (The JS port's in-text matcher is unreliable, so extract-then-validate is the robust path.)
- `ipaddr.mjs` (ipaddr.js, MIT): validate/classify extracted IP candidates; drop invalid octets; flag
  private/reserved ranges.
- `presidio.mjs`: Presidio-inspired **MIT regex patterns** (patterns, not the library) for SSN, IBAN,
  BIC, BTC/ETH addresses, etc.
- `profanity.mjs` (obscenity MIT + leo-profanity MIT): `obscenity`'s substitution-aware matcher handles
  leetspeak/char-substitution; leo-profanity as a second English list. Emits matched term + span.
- `wordlists.mjs` (naughty-words): per-language lists, whole-word match, sets `language` on each hit.
  Covers non-English deterministically (deliverable c).
- `spam.mjs`: configurable shortener domains, scam keywords, excessive-URL / all-caps heuristics.

Each dep's license is recorded in `LICENSES.md` (see Licensing).

---

## Task 3 — `moderate(text, opts) -> ModerationResult`

**Signature:** `moderate(text, { neural?, config?, lowercase? } = {}) -> ModerationResult`

### Pipeline (with the materiality gate)

```
normalized, map = normalize(raw, { lowercase })
material        = nfkcHomoglyph(raw) !== raw          // ignore the optional lowercase step for the gate
flags = detect(raw)  ∪  (material ? detect(normalized, { map }) : ∅)   // dedup by original span
model = neural ? neural(raw) : null                    // ONE pass, always on raw
result = merge(flags, model, config)
```

- **Immaterial** (the common case — plain text): raw ≡ normalized, so detectors run **once** on raw and
  the model runs **once** on raw. Normalization adds ~one `String.normalize` + a compare. Near-zero cost.
- **Material** (input is actually obfuscated): detectors run on **both** raw and normalized (cheap
  regex/wordlist work), unioned and deduped by original span. The model still runs on raw — the
  rules-on-normalized carry the obfuscation load, which is where deterministic detection is strongest
  (obfuscation is overwhelmingly lexical). This resolves the model distribution-shift concern.
- **Dedup across passes:** both passes emit original coords (normalized pass via `map.toOriginal`, raw
  pass is identity), so identical hits collapse by original span.
- **Model spans need no remap** — the model runs on raw, so its byte-BIO spans (via
  `reference/moderate.mjs` `piiSpans`) are already in original UTF-16 coords.

### Head registry (`heads.mjs`) — forward-compat for the V2 model

A config-driven list; `moderate()` only ever emits from **enabled** heads (deliverable d).

```ts
Head = { name:string, kind:"model"|"rule", enabled:boolean, threshold:number, labels:string[] }
```

- Deterministic detectors are registered as **rule heads**, so the same enable/threshold machinery
  governs rules and model uniformly, and disabling a slow/noisy detector is one flag.
- **Default-enabled today:** jigsaw toxicity (validated), structured-PII rules, profanity/wordlist/spam
  rules, model unstructured-PII. `taxonomy`(11) stays behind a flag (weaker, license-gated per SPEC).
- **Pre-registered but `enabled:false`:** the incoming V2 heads — spam-ML, prompt-injection/jailbreak,
  NSFW-severity, target-identity. Flip them on when the model gains them and they pass the eval gate.
  No code change needed to add a head — only a registry entry.

### Merge policy

- **Union** of all flags → reasons.
- **Agreement boost:** when a rule and a model head corroborate (same span/label family), boost the
  model score via `score = 1 − (1 − a)(1 − b)` (capped at 1.0) and mark the reason corroborated.
- **PII dedupe:** on overlapping PII spans, **prefer the validated rule span** and drop the model span;
  keep the model span only where no rule covers it.
- **Categories:** `categories: Record<head, number>` = max score per head over its reasons.

---

## Task 4 — explainability, types, and the React badge

### Types (shipped exactly as specified)

```ts
interface Reason {
  source: "rule" | "wordlist" | "model";
  detector: string;          // "validator.email", "naughty-words:es", "model.jailbreak"
  label: string;             // "EMAIL", "harassment", "role_hijack"
  span?: [number, number];   // char offsets INTO THE ORIGINAL text
  matched?: string;          // the exact substring/keyword that fired
  score?: number;            // model confidence (0..1) or 1.0 for a hard rule
  language?: string;         // for wordlist hits
}
interface ModerationResult {
  flagged: boolean;
  categories: Record<string, number>;   // head -> max score
  piiSpans: { entity: string; span: [number, number]; source: string }[];
  reasons: Reason[];
  normalizedText: string;
}
```

`ModerationResult` stays **plain and JSON-serializable**.

### `explain()` / `explainReason()`

- `explainReason(reason) -> string` renders one reason in plain English.
- `explain(result) -> string` groups reasons by category and produces, e.g.:
  > "Flagged harassment (model, 0.91) and matched slur '…' (wordlist:pt) at chars 12–18; found EMAIL at
  > 40–58 via validator.js"

  Includes source, detector, score, **original-coord** span, matched text, and language where present.
- `reason.explain()` sugar is offered via a lightweight wrapper without breaking serializability.

### `<ModerationBadge result={...}/>`

A small pill showing flagged state + reason count; on hover/focus it reveals a tooltip listing each
reason via `explainReason()`. Accessible (focusable, `role`/`aria`), themed with the existing
`part`/`data-*`/CSS-custom-property conventions (`react/fela.css`). Exported from `react/index.ts`.

---

## `check()` adapter (preserve the DevEx layer)

`check()` is refactored to call `moderate()` and map `ModerationResult → { findings, blocked, warned }`:

- PII reasons → `Finding.category:"pii"`; toxicity/profanity/wordlist/etc. → the existing `"toxicity"`
  knob.
- `Reason.source`: `rule`/`wordlist` → `Finding.source:"regex"`; `model` → `"model"`.
- Two-knob severity mapping is unchanged.

The existing `reference/validate.test.mjs` and the entire DevEx/React/web/CLI suite must stay green.

---

## Performance — the normalization gate + published, per-head penalty

**`bench.mjs`** is a deterministic Node micro-benchmark that reports **p50/p95** latency, decomposed
**per head and per tool** so a big offender is visible and can be disabled to keep the bundle lean:

| segment measured | isolates |
|---|---|
| `normalize()` alone | canonicalization cost |
| each detector individually (per-tool) | which rule/wordlist/validator is expensive |
| detectors, 1 pass vs 2 passes | the immaterial vs obfuscated (material) case |
| each model head (per-head, where the model exposes it) | which head costs what |
| model pass total | reuse/measure the ~22 ms/window figure (phone 3–8×) |
| `moderate()` end-to-end, model-off vs model-on | the real widget number |

The per-tool/per-head numbers feed directly into the head registry: anything that costs too much for its
signal ships `enabled:false`. A Playwright timing hook in the demo captures one end-to-end in-browser
widget latency for the README. The README gets a **"What you pay"** table filled from the bench —
measured, not fabricated.

---

## Licensing (`LICENSES.md`)

A table vetting each dependency against its **actual `node_modules` license file** at implementation
time: validator.js (MIT), google-libphonenumber (Apache-2.0), ipaddr.js (MIT), obscenity (MIT),
leo-profanity (MIT), unhomoglyph (MIT), naughty-words (**verify** — LDNOOBW list; if CC-BY-NC, swap for
an MIT multilingual list). Any GPL/AGPL/CC-BY-NC/OpenRAIL dep is rejected with a noted fallback.

---

## Testing (deliverables a–d + gate + bench + back-compat)

- **(a) Obfuscation caught post-normalize:** `Ⅴ1@gⓡ@`-style and homoglyph email/slur inputs fire; assert
  normalized form and that a flag fires.
- **(b) Every reason has a correct original-text span:** for each `Reason` with a span,
  `original.slice(span[0], span[1])` equals/covers `matched`. Round-trips through `map.toOriginal`.
- **(c) Non-English slur:** a Spanish/Portuguese term fires `naughty-words` with `language` set.
- **(d) Disabled heads never appear:** a head set `enabled:false` produces zero reasons and no category.
- **Materiality gate:** immaterial input → detectors run once + model on raw; material input → dual
  detector pass; assert both.
- **Merge:** PII dedupe prefers the validated rule span; agreement boost raises a corroborated score.
- **Back-compat:** `reference/validate.test.mjs` and the full React/web/CLI suite stay green.
- **Bench:** `bench.mjs` emits per-tool + per-head numbers without throwing (smoke).

---

## README

- **Hybrid architecture diagram:** `normalize → [ rules ∥ model ] → merge → explainable result`.
- **"Explainable by default"** pitch: every decision carries a structured, human-readable reason.
- Updated **How it works** table (add normalization + the detector roster).
- `explain()` + `<ModerationBadge>` example.
- The **"What you pay"** latency table from `bench.mjs`.

---

## Component units (isolation & testability)

- `normalize(text)` — pure; in: string; out: `{ normalized, map }`. Testable with plain strings.
- Each detector adapter — pure; in: text; out: `RawFlag[]`. Independently testable and independently
  disableable via the registry.
- `detect(text, {map, config})` — runs enabled detectors, maps spans to original coords.
- `engine.moderate(text, opts)` — orchestrates normalize + gate + detect + model + merge. Depends on the
  above only. Testable with a stubbed `neural`.
- `heads.mjs` — pure data + helpers; the single place enable/threshold live.
- `explain.mjs` — pure; in: `ModerationResult`/`Reason`; out: string.
- `<ModerationBadge>` — pure presentational; in: `ModerationResult`; no detection logic.
- `check()` — adapter over `moderate()`; keeps the two-knob DevEx contract stable.

## Error handling

- **Fail-open on the neural path:** a model load/inference throw never blocks rule detection; report via
  the existing `onError`. Preserves today's behavior.
- A detector that throws is isolated: it is skipped, logged via `onError`, and the rest still run.
- Empty/whitespace text → no reasons, `flagged:false`.

## Open items for the implementation plan

- Exact candidate-extraction regexes feeding each validator (email/phone/IP/card).
- Final `naughty-words` license verification and the fallback list if needed.
- The precise `bench.mjs` input corpus and how per-head timing is obtained when the model exposes heads
  jointly (fallback: whole-model timing + per-rule-head timing).
