---
"@lowdown/moderate": minor
---

Hybrid + explainable moderation engine.

- `normalize(text)` — NFKC + homoglyph un-mapping with a cluster-based offset map, so obfuscated input
  (fullwidth, circled, homoglyph, leetspeak, NFD combining marks) is defeated while every span still
  points at the original text.
- Seven deterministic MIT/permissive detectors behind `detect()`: validator.js (EMAIL/URL/CREDITCARD),
  google-libphonenumber (PHONE), ipaddr.js (IP), Presidio-style regex (SSN/IBAN/BIC/BTC/ETH),
  obscenity + leo-profanity (English), naughty-words (multilingual slurs), and spam heuristics.
- `moderate(text) -> ModerationResult` — normalize → materiality-gated detector dual-pass + on-device
  model → merge, with a config-driven head registry (V2 model heads pre-registered, disabled until they
  pass the eval gate). Structured `Reason`s make every decision explainable; `explain()` renders them.
- Zero-dependency **Standard Schema + Zod** validation adapters (`@lowdown/moderate/schema`), a React
  `<ModerationBadge>`, and a per-tool/per-head latency benchmark.

Behavior change: `check()` is now a thin adapter over `moderate()` and will flag deterministic
profanity/spam even when no neural model is attached — a wider default detection surface than before.
