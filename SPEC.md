# FELA-moderator on-device SDK — inference & post-processing spec

Ground truth = the shipped model (`modeling.py` / `config.json`) and `model/moderator_int8.tflite`.
Reference implementation + tests: [`reference/moderate.mjs`](reference/moderate.mjs) (all pass).

## 1. Model contract (the static TFLite graph)

- **Input:** `input_ids` int32 `[1, 512]`.
- **Outputs (raw logits):** `taxonomy [1,11]`, `jigsaw [1,6]`, `pii [1,512,113]`.
- The attention mask is derived **inside** the graph (`ids != 256`); the SDK passes only `input_ids`.
- **Text never leaves the device.** Inference is 100% local (XNNPACK int8 on CPU by default).

## 2. Byte tokenization (the whole "tokenizer")

The model is byte-level — there is **no vocab file**. Encode one string as:

```
input_ids = [CLS=257, b0, b1, …, b_{n-1}]   where b* = UTF-8 bytes (0–255), n ≤ 511
pad to 512 with PAD=256; truncate bytes past 511
```

Token `t` (t ≥ 1) corresponds to **UTF-8 byte (t−1)**; token 0 is CLS. Per platform:
`TextEncoder().encode(s)` (JS) · `s.getBytes(UTF_8)` (Kotlin) · `Array(s.utf8)` (Swift).

## 3. Toxicity (jigsaw head — the license-clean, int8-validated head)

`sigmoid(jigsaw[i])` → probability for `config.json.jigsaw_labels[i]`
= `toxic, severe_toxic, obscene, threat, insult, identity_hate`. Flag category `i` when
`prob ≥ config.json.toxicity_thresholds[label]` (ship those thresholds; they are per-category tuned).
The `taxonomy` head (11 OpenAI-aligned categories) is available the same way but is weaker (val
macro-AUROC ~0.93) and its supervision is license-gated — expose behind a flag.

## 4. PII detection + redaction (the fiddly part)

`pii[t]` → `argmax` over 113 → `config.json.pii_tags[id]` (BIO, e.g. `B-EMAIL` / `I-EMAIL` / `O`).

1. Walk tokens `t = 1..`; skip PAD (`byteOfToken[t] < 0`). Merge contiguous `B-<E>`/`I-<E>` runs into
   spans in **byte** coordinates `[byteStart, byteEnd)` (byte = `t−1`).
2. **Map byte spans → native string indices.** This is the one correctness trap: the model works in
   UTF-8 bytes, but Kotlin/JS strings are **UTF-16** and Swift is grapheme/utf8. A char is 1–4 bytes
   and 1–2 UTF-16 units (2 for astral/emoji). Build, per byte offset, the containing char's
   `[startUtf16, endUtf16)` and map `startUtf16 = start(byteStart)`, `endUtf16 = end(byteEnd−1)` so a
   span always covers **whole characters**. See `charBoundsByByte` / `piiSpans`.
3. Redact by replacing each UTF-16 range with a mask (one mask glyph per code point). Apply spans
   right-to-left so earlier indices stay valid.

**Verified** in `reference/test.mjs` on `"你好 a@b.co 😀!"`: email bytes 7–12 → UTF-16 [3,9) → `"a@b.co"`;
astral emoji bytes 14–17 → UTF-16 [10,12) (2 units) → masks as one glyph. **PII at pad positions is
undefined — only read `t` with `byteOfToken[t] ≥ 0`.**

## 5. Long text (> 511 bytes): sliding window

Split the UTF-8 byte stream into windows of ≤ 511 bytes with an overlap (suggest stride 384, overlap
128 to avoid entity/context truncation at boundaries). Per window prepend CLS, run inference, then:

- **Toxicity:** aggregate across windows by **max** probability per category (a document is toxic if
  any window is).
- **PII:** convert each window's local byte spans to **global** byte offsets (`windowByteStart +
  localByte`), then dedupe/merge overlapping spans before the UTF-16 mapping in §4.

Single-window (≤ 511 bytes) is the common case and needs none of this.

## 6. Platform mapping notes

| Platform | String unit | Byte source | Redaction index space |
|---|---|---|---|
| Kotlin/Android | UTF-16 | `String.toByteArray(UTF_8)` | UTF-16 (`String` offsets) — same math as JS |
| Swift/iOS | grapheme / UTF-8 view | `Array(s.utf8)` | map bytes → `String.Index` via `utf8`/`unicodeScalars` |
| TypeScript/web | UTF-16 | `TextEncoder` | UTF-16 — reference impl is this exactly |

Android ships XNNPACK int8 CPU by default (optional NNAPI/GPU delegate); iOS CPU/CoreML/Metal; the RN
bridge calls the native module. All wrap the same 4 steps above.
