# Hybrid Engine — Plan 1: Normalization + Detector Framework

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the obfuscation-defeating `normalize()` (with an original-text offset map) and the deterministic MIT/permissive detector framework (`detect()` + eight adapters), each emitting spans that point at the original text.

**Architecture:** `normalize(text)` returns `{ normalized, map }` where `map.toOriginal(nStart,nEnd)` maps normalized-coord spans back to original-coord spans. Each detector adapter is a pure `detect(text) -> Flag[]` in the coords of the text handed to it. `detectors/index.mjs` runs the enabled detectors and (given a `map`) remaps every span to original coords. This plan is the foundation; the `moderate()` pipeline that orchestrates it is Plan 2.

**Tech Stack:** Zero-build ESM (`.mjs` + JSDoc), Node 18+/browser `TextEncoder`/`String.normalize`. Detector libs (all verified permissive): validator.js (MIT), google-libphonenumber (MIT AND Apache-2.0), ipaddr.js (MIT), obscenity (MIT), leo-profanity (MIT), naughty-words (CC-BY-4.0), unhomoglyph (MIT). Tests: `node <file>.test.mjs` (matches the core's existing `validate.test.mjs` style).

## Global Constraints

- **MIT/permissive dependencies only.** No GPL/AGPL/CC-BY-NC/OpenRAIL. Every dep vetted in `LICENSES.md`.
- **Runs in-browser and in Node.** No server round-trip. No tokenizer (byte-level stays byte-level).
- **Detectors are pure/offline — hard invariant.** No DNS/MX lookups, no `fetch`, no I/O; never enable a
  validator's network options. Text never leaves the device.
- **Core stays zero-build ESM** (`.mjs`, JSDoc). Do NOT convert to TypeScript.
- **Every emitted span is in ORIGINAL-text UTF-16 coords** — detectors map through `map.toOriginal`.
- **NFKC runs before unhomoglyph** (NFKC folds `ⓡ→r`; unhomoglyph alone does not).
- **obscenity `match.endIndex` is INCLUSIVE** — a match covers `text.slice(startIndex, endIndex + 1)`.
- Package name `@lowdown/moderate`. Follow the comment/naming density of `reference/checkers.mjs`.

---

### Task 1: `normalize(text)` + offset map

**Files:**
- Create: `reference/normalize.mjs`
- Test: `reference/normalize.test.mjs`

**Interfaces:**
- Produces:
  - `skeleton(text: string) => string` — NFKC then unhomoglyph, no lowercasing (whole-string; used by the materiality gate in Plan 2).
  - `normalize(text: string, opts?: { lowercase?: boolean }) => { normalized: string, map: OffsetMap }`
  - `OffsetMap = { toOriginal(nStart: number, nEnd: number): [number, number], srcStart: number[], srcEnd: number[] }`
  - `toOriginal` returns original `[start,end)` covering whole original characters (min start / max end over the covered normalized units). For an empty span (`nEnd<=nStart`) returns a zero-width range at the mapped start.

- [ ] **Step 1: Write the failing test** — `reference/normalize.test.mjs`:

```js
// Run: node reference/normalize.test.mjs
import { normalize, skeleton } from "./normalize.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

// NFKC folds compat chars; unhomoglyph folds confusables. NFKC must run first (circled r).
ok(skeleton("ⓡ") === "r", "NFKC folds circled r");
ok(skeleton("Ⅴ") === "V", "NFKC folds roman numeral V");
ok(skeleton("Аpple") === "Apple", "unhomoglyph folds Cyrillic A");

// normalize applies skeleton (+ optional lowercase) and reports normalized text
const { normalized } = normalize("Ⅴ1@gⓡ@", { lowercase: false });
ok(normalized.includes("V") && normalized.includes("r"), "obfuscated form canonicalized");
ok(normalize("ABC", { lowercase: true }).normalized === "abc", "lowercase option");

// offset map: a span in normalized coords maps back to whole original chars
const n = normalize("aⓡb");            // 'ⓡ' is one original code unit that folds to 'r'
const rIdx = n.normalized.indexOf("r"); // position of the folded char in normalized
const [s, e] = n.map.toOriginal(rIdx, rIdx + 1);
ok(n.normalized === "arb", "circled r folded inline");
ok("aⓡb".slice(s, e) === "ⓡ", "span maps to the original circled r");

// astral/multi-unit original char maps as a whole
const emoji = normalize("x😀y");
ok(emoji.normalized === "x😀y", "emoji unchanged by NFKC");
const eStart = emoji.normalized.indexOf("😀");
const [es, ee] = emoji.map.toOriginal(eStart, eStart + 2); // emoji is 2 UTF-16 units
ok("x😀y".slice(es, ee) === "😀", "astral char maps whole");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node reference/normalize.test.mjs`
Expected: FAIL — `./normalize.mjs` not found.

- [ ] **Step 3: Implement `reference/normalize.mjs`:**

```js
// Obfuscation-defeating normalization + an offset map back to the ORIGINAL text.
// Pipeline: NFKC (folds compat forms, e.g. circled/roman/fullwidth) -> unhomoglyph (folds confusables,
// e.g. Cyrillic look-alikes) -> optional lowercasing. NFKC MUST run first (unhomoglyph leaves ⓡ alone).
// The map records, per normalized UTF-16 unit, the source original char's [start,end) so any span in
// normalized coords maps back to whole original characters.
import unhomoglyph from "unhomoglyph";

/** NFKC + unhomoglyph, whole-string, no lowercasing. Used by the materiality gate. */
export function skeleton(text) {
  return unhomoglyph(text.normalize("NFKC"));
}

/**
 * @param {string} text
 * @param {{ lowercase?: boolean }} [opts]
 * @returns {{ normalized: string, map: { toOriginal(nStart:number,nEnd:number):[number,number], srcStart:number[], srcEnd:number[] } }}
 */
export function normalize(text, { lowercase = false } = {}) {
  let normalized = "";
  const srcStart = []; // per normalized UTF-16 unit: original start index
  const srcEnd = [];   // per normalized UTF-16 unit: original end index (exclusive)
  let origIdx = 0;
  for (const ch of text) {                 // iterate original by code point
    const cpUnits = ch.length;             // 1 or 2 UTF-16 units in the original
    let mapped = skeleton(ch);             // per-code-point normalization
    if (lowercase) mapped = mapped.toLowerCase();
    for (let k = 0; k < mapped.length; k++) { srcStart.push(origIdx); srcEnd.push(origIdx + cpUnits); }
    normalized += mapped;
    origIdx += cpUnits;
  }
  const map = {
    srcStart, srcEnd,
    toOriginal(nStart, nEnd) {
      if (nEnd <= nStart) { const p = srcStart[nStart] ?? origIdx; return [p, p]; }
      let s = Infinity, e = -Infinity;
      for (let i = nStart; i < nEnd; i++) {
        if (srcStart[i] < s) s = srcStart[i];
        if (srcEnd[i] > e) e = srcEnd[i];
      }
      return [s, e];
    },
  };
  return { normalized, map };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node reference/normalize.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add reference/normalize.mjs reference/normalize.test.mjs
git commit -m "feat(normalize): NFKC+homoglyph normalization with original-text offset map"
```

---

### Task 2: `validator.js` adapter — EMAIL, URL, CREDITCARD

**Files:**
- Create: `reference/detectors/validator.mjs`
- Test: `reference/detectors/validator.test.mjs`

**Interfaces:**
- Consumes: `validator` (validator.js).
- Produces: `detect(text: string) => Flag[]` where
  `Flag = { source:"rule", detector:string, label:string, span:[number,number], matched:string, score:1, category:"pii" }`.
  Spans are in the coords of `text`. Labels: `EMAIL` (detector `validator.email`), `URL`
  (`validator.url`), `CREDITCARD` (`validator.creditcard`). IP is owned by Task 4 (ipaddr), not here.

- [ ] **Step 1: Write the failing test** — `reference/detectors/validator.test.mjs`:

```js
// Run: node reference/detectors/validator.test.mjs
import { detect } from "./validator.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };
const has = (fs, label) => fs.find((f) => f.label === label);

const t = "mail joe@example.com see http://x.com card 4111 1111 1111 1111 end";
const fs = detect(t);
const email = has(fs, "EMAIL");
ok(email && t.slice(email.span[0], email.span[1]) === "joe@example.com", "email span exact");
ok(email.detector === "validator.email" && email.source === "rule" && email.score === 1, "email flag shape");
const url = has(fs, "URL");
ok(url && t.slice(url.span[0], url.span[1]) === "http://x.com", "url span exact");
const cc = has(fs, "CREDITCARD");
ok(cc && cc.matched.replace(/\D/g, "") === "4111111111111111", "credit card matched (Luhn valid)");

// a non-Luhn 16-digit run is rejected
ok(!detect("1234 5678 9012 3456").some((f) => f.label === "CREDITCARD"), "non-Luhn card rejected");
// clean text -> nothing
ok(detect("just a hello").length === 0, "clean -> no flags");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node reference/detectors/validator.test.mjs`
Expected: FAIL — `./validator.mjs` not found.

- [ ] **Step 3: Implement `reference/detectors/validator.mjs`:**

```js
// validator.js adapter (MIT): extract candidate substrings by regex (for exact spans), then VALIDATE
// with validator.js to kill false positives. Owns EMAIL, URL, CREDITCARD. IP is owned by ipaddr.mjs.
import validator from "validator";

const CANDIDATES = [
  { label: "EMAIL", detector: "validator.email", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, valid: (v) => validator.isEmail(v) },
  { label: "URL", detector: "validator.url", re: /\bhttps?:\/\/[^\s]+/gi, valid: (v) => validator.isURL(v) },
  { label: "CREDITCARD", detector: "validator.creditcard", re: /\b(?:\d[ -]?){13,19}\b/g, valid: (v) => validator.isCreditCard(v.replace(/[ -]/g, "")) },
];

/** @returns {Array<{source:"rule",detector:string,label:string,span:[number,number],matched:string,score:1,category:"pii"}>} */
export function detect(text) {
  const flags = [];
  for (const c of CANDIDATES) {
    for (const m of text.matchAll(c.re)) {
      const val = m[0];
      if (!c.valid(val)) continue;
      flags.push({ source: "rule", detector: c.detector, label: c.label, span: [m.index, m.index + val.length], matched: val, score: 1, category: "pii" });
    }
  }
  return flags;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node reference/detectors/validator.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add reference/detectors/validator.mjs reference/detectors/validator.test.mjs
git commit -m "feat(detectors): validator.js adapter (EMAIL/URL/CREDITCARD, extract-then-validate)"
```

---

### Task 3: `google-libphonenumber` adapter — PHONE

**Files:**
- Create: `reference/detectors/phone.mjs`
- Test: `reference/detectors/phone.test.mjs`

**Interfaces:**
- Consumes: `google-libphonenumber` (`PhoneNumberUtil`, `PhoneNumberFormat`).
- Produces: `detect(text: string, opts?: { region?: string }) => Flag[]`. Default `region = "US"`.
  Label `PHONE`, detector `libphonenumber`, `category:"pii"`, `suggestion` = E.164 form.
  `Flag` adds an optional `suggestion?: string`.

- [ ] **Step 1: Write the failing test** — `reference/detectors/phone.test.mjs`:

```js
// Run: node reference/detectors/phone.test.mjs
import { detect } from "./phone.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

const t = "call me at 415-555-2671 tomorrow";
const fs = detect(t);
const p = fs.find((f) => f.label === "PHONE");
ok(p && t.slice(p.span[0], p.span[1]) === "415-555-2671", "phone span exact");
ok(p.detector === "libphonenumber" && p.suggestion === "+14155552671", "phone flag + E.164 suggestion");

// a random digit run that is not a valid number is rejected
ok(!detect("order 12 34 for 5 items").some((f) => f.label === "PHONE"), "invalid number rejected");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node reference/detectors/phone.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `reference/detectors/phone.mjs`:**

```js
// google-libphonenumber adapter (Apache-2.0): extract phone-ish candidates, then parse + validate.
// The JS port's in-text matcher is unreliable, so extract-then-validate is the robust path.
import glpn from "google-libphonenumber";

const UTIL = glpn.PhoneNumberUtil.getInstance();
const CANDIDATE = /\+?\d[\d\-\s().]{6,}\d/g; // 8+ chars starting/ending with a digit

/** @returns {Array<{source:"rule",detector:"libphonenumber",label:"PHONE",span:[number,number],matched:string,score:1,category:"pii",suggestion?:string}>} */
export function detect(text, { region = "US" } = {}) {
  const flags = [];
  for (const m of text.matchAll(CANDIDATE)) {
    const val = m[0];
    try {
      const num = UTIL.parseAndKeepRawInput(val, region);
      if (!UTIL.isValidNumber(num)) continue;
      const e164 = UTIL.format(num, glpn.PhoneNumberFormat.E164);
      flags.push({ source: "rule", detector: "libphonenumber", label: "PHONE", span: [m.index, m.index + val.length], matched: val, score: 1, category: "pii", suggestion: e164 });
    } catch { /* unparseable candidate — skip */ }
  }
  return flags;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node reference/detectors/phone.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add reference/detectors/phone.mjs reference/detectors/phone.test.mjs
git commit -m "feat(detectors): google-libphonenumber adapter (PHONE + E.164 suggestion)"
```

---

### Task 4: `ipaddr.js` adapter — IPV4 / IPV6

**Files:**
- Create: `reference/detectors/ipaddr.mjs`
- Test: `reference/detectors/ipaddr.test.mjs`

**Interfaces:**
- Consumes: `ipaddr.js`.
- Produces: `detect(text) => Flag[]`. Labels `IPV4` / `IPV6` (detector `ipaddr`), `category:"pii"`.
  Each flag carries `range: string` (ipaddr's classification, e.g. `"private"`, `"unicast"`, `"loopback"`).

- [ ] **Step 1: Write the failing test** — `reference/detectors/ipaddr.test.mjs`:

```js
// Run: node reference/detectors/ipaddr.test.mjs
import { detect } from "./ipaddr.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

const t = "server 192.168.0.1 and 2001:db8::1 here";
const fs = detect(t);
const v4 = fs.find((f) => f.label === "IPV4");
ok(v4 && t.slice(v4.span[0], v4.span[1]) === "192.168.0.1", "ipv4 span exact");
ok(v4.range === "private", "ipv4 classified private");
const v6 = fs.find((f) => f.label === "IPV6");
ok(v6 && t.slice(v6.span[0], v6.span[1]) === "2001:db8::1", "ipv6 span exact");

// invalid octet rejected
ok(!detect("code 999.1.1.1 here").some((f) => f.label === "IPV4"), "invalid octet rejected");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node reference/detectors/ipaddr.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `reference/detectors/ipaddr.mjs`:**

```js
// ipaddr.js adapter (MIT): extract IP-ish candidates, validate + classify (private/reserved/loopback).
import ipaddr from "ipaddr.js";

const V4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const V6 = /\b(?:[A-F0-9]{0,4}:){2,7}[A-F0-9]{0,4}\b/gi;

function push(flags, label, val, index) {
  if (!ipaddr.isValid(val)) return;
  let range = "unicast";
  try { range = ipaddr.parse(val).range(); } catch { return; }
  flags.push({ source: "rule", detector: "ipaddr", label, span: [index, index + val.length], matched: val, score: 1, category: "pii", range });
}

/** @returns {Array<{source:"rule",detector:"ipaddr",label:"IPV4"|"IPV6",span:[number,number],matched:string,score:1,category:"pii",range:string}>} */
export function detect(text) {
  const flags = [];
  for (const m of text.matchAll(V4)) push(flags, "IPV4", m[0], m.index);
  for (const m of text.matchAll(V6)) push(flags, "IPV6", m[0], m.index);
  return flags;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node reference/detectors/ipaddr.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add reference/detectors/ipaddr.mjs reference/detectors/ipaddr.test.mjs
git commit -m "feat(detectors): ipaddr.js adapter (IPV4/IPV6 validate + classify)"
```

---

### Task 5: Presidio-style regex adapter — SSN, IBAN, BIC, BTC, ETH

**Files:**
- Create: `reference/detectors/presidio.mjs`
- Test: `reference/detectors/presidio.test.mjs`

**Interfaces:**
- Produces: `detect(text) => Flag[]`. Labels `SSN`, `IBAN`, `BIC`, `BITCOINADDRESS`, `ETHEREUMADDRESS`
  (detector `presidio.<label lowercased>`), `category:"pii"`. Pure regex (MIT patterns — patterns, not
  the Presidio library). SSN validated to reject `000`/`666`/`9xx` area and `00` group / `0000` serial.

- [ ] **Step 1: Write the failing test** — `reference/detectors/presidio.test.mjs`:

```js
// Run: node reference/detectors/presidio.test.mjs
import { detect } from "./presidio.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };
const find = (t, label) => detect(t).find((f) => f.label === label);

ok(find("ssn 123-45-6789 x", "SSN")?.matched === "123-45-6789", "SSN matched");
ok(!find("bad 000-45-6789", "SSN"), "SSN area 000 rejected");
ok(find("iban GB82WEST12345698765432 x", "IBAN")?.matched === "GB82WEST12345698765432", "IBAN matched");
ok(find("bic DEUTDEFF x", "BIC")?.matched === "DEUTDEFF", "BIC matched");
ok(find("btc 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa x", "BITCOINADDRESS")?.matched?.startsWith("1A1zP1"), "BTC matched");
ok(find("eth 0x52908400098527886E0F7030069857D2E4169EE7 x", "ETHEREUMADDRESS")?.matched?.startsWith("0x5290"), "ETH matched");
const s = detect("ssn 123-45-6789");
ok(s[0].detector === "presidio.ssn" && s[0].source === "rule" && s[0].category === "pii", "flag shape");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node reference/detectors/presidio.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `reference/detectors/presidio.mjs`:**

```js
// Presidio-style structured-PII regexes (MIT patterns — ported patterns, not the library).
const RULES = [
  { label: "SSN", re: /\b\d{3}-\d{2}-\d{4}\b/g, valid: (v) => { const [a, b, c] = v.split("-"); return a !== "000" && a !== "666" && a[0] !== "9" && b !== "00" && c !== "0000"; } },
  { label: "IBAN", re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, valid: () => true },
  { label: "BIC", re: /\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g, valid: () => true },
  { label: "BITCOINADDRESS", re: /\b(?:bc1[a-z0-9]{25,39}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g, valid: () => true },
  { label: "ETHEREUMADDRESS", re: /\b0x[a-fA-F0-9]{40}\b/g, valid: () => true },
];

/** @returns {Array<{source:"rule",detector:string,label:string,span:[number,number],matched:string,score:1,category:"pii"}>} */
export function detect(text) {
  const flags = [];
  for (const r of RULES) {
    for (const m of text.matchAll(r.re)) {
      if (!r.valid(m[0])) continue;
      flags.push({ source: "rule", detector: "presidio." + r.label.toLowerCase(), label: r.label, span: [m.index, m.index + m[0].length], matched: m[0], score: 1, category: "pii" });
    }
  }
  return flags;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node reference/detectors/presidio.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add reference/detectors/presidio.mjs reference/detectors/presidio.test.mjs
git commit -m "feat(detectors): Presidio-style regexes (SSN/IBAN/BIC/BTC/ETH)"
```

---

### Task 6: Profanity adapter — obscenity + leo-profanity (English, substitution-aware)

**Files:**
- Create: `reference/detectors/profanity.mjs`
- Test: `reference/detectors/profanity.test.mjs`

**Interfaces:**
- Consumes: `obscenity` (`RegExpMatcher`, `englishDataset`, `englishRecommendedTransformers`),
  `leo-profanity`.
- Produces: `detect(text) => Flag[]`, label `profanity`, `source:"wordlist"`, `category:"profanity"`,
  `language:"en"`. Detectors `obscenity` (substitution-aware; primary, span-accurate) and `leo-profanity`
  (word-boundary scan; only adds spans not already covered by obscenity). NOTE: obscenity `endIndex` is
  inclusive → `matched = text.slice(startIndex, endIndex + 1)`.

- [ ] **Step 1: Write the failing test** — `reference/detectors/profanity.test.mjs`:

```js
// Run: node reference/detectors/profanity.test.mjs
import { detect } from "./profanity.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

const t = "what the fuck man";
const fs = detect(t);
const f = fs.find((x) => x.detector === "obscenity");
ok(f && t.slice(f.span[0], f.span[1]).toLowerCase().includes("fuck"), "obscenity span covers the word");
ok(f.source === "wordlist" && f.category === "profanity" && f.language === "en", "profanity flag shape");

// leetspeak substitution is caught
ok(detect("you f4ggot").length > 0, "leetspeak caught by obscenity");
// clean text -> nothing
ok(detect("what a lovely day").length === 0, "clean -> no flags");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node reference/detectors/profanity.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `reference/detectors/profanity.mjs`:**

```js
// Profanity (English, substitution-aware): obscenity (MIT) for span-accurate leetspeak-tolerant matches,
// leo-profanity (MIT) as a second word list adding spans obscenity missed.
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import leo from "leo-profanity";

const MATCHER = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LEO = new RegExp("\\b(" + leo.list().map(esc).join("|") + ")\\b", "gi");

const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1];

/** @returns {Array<{source:"wordlist",detector:string,label:"profanity",span:[number,number],matched:string,score:1,category:"profanity",language:"en"}>} */
export function detect(text) {
  const flags = [];
  for (const m of MATCHER.getAllMatches(text, true)) {
    const span = [m.startIndex, m.endIndex + 1]; // obscenity endIndex is INCLUSIVE
    flags.push({ source: "wordlist", detector: "obscenity", label: "profanity", span, matched: text.slice(span[0], span[1]), score: 1, category: "profanity", language: "en" });
  }
  for (const m of text.matchAll(LEO)) {
    const span = [m.index, m.index + m[0].length];
    if (flags.some((f) => overlaps(f.span, span))) continue; // already covered by obscenity
    flags.push({ source: "wordlist", detector: "leo-profanity", label: "profanity", span, matched: m[0], score: 1, category: "profanity", language: "en" });
  }
  return flags;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node reference/detectors/profanity.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add reference/detectors/profanity.mjs reference/detectors/profanity.test.mjs
git commit -m "feat(detectors): obscenity + leo-profanity English profanity adapter"
```

---

### Task 7: Multilingual wordlists adapter — naughty-words

**Files:**
- Create: `reference/detectors/wordlists.mjs`
- Test: `reference/detectors/wordlists.test.mjs`

**Interfaces:**
- Consumes: `naughty-words` (default export = `{ [lang]: string[] }`).
- Produces:
  - `DEFAULT_LANGS: string[]` = `["es","pt","fr","de","it","ru","ar"]` (English is owned by Task 6).
  - `detect(text, opts?: { langs?: string[] }) => Flag[]`, label `slur`, `source:"wordlist"`,
    `category:"profanity"`, `language:<lang>`, detector `naughty-words:<lang>`. Unicode-aware word
    boundaries (`\p{L}`/`\p{N}` lookarounds) so non-Latin scripts match.

- [ ] **Step 1: Write the failing test** — `reference/detectors/wordlists.test.mjs`:

```js
// Run: node reference/detectors/wordlists.test.mjs
import nw from "naughty-words";
import { detect } from "./wordlists.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

// pick a real Spanish term from the shipped list so the test can't drift from the data
const esWord = nw.es[0];
const t = `hola ${esWord} amigo`;
const fs = detect(t);
const hit = fs.find((f) => f.language === "es");
ok(hit && t.slice(hit.span[0], hit.span[1]) === esWord, "Spanish slur span exact");
ok(hit.detector === "naughty-words:es" && hit.source === "wordlist" && hit.category === "profanity", "wordlist flag shape");

// substring inside a bigger word does NOT fire (boundary check)
ok(!detect(`x${esWord}yzq`).some((f) => f.language === "es"), "no substring false-positive");
// clean text -> nothing
ok(detect("una frase totalmente limpia").length === 0, "clean -> no flags");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node reference/detectors/wordlists.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `reference/detectors/wordlists.mjs`:**

```js
// Multilingual deterministic slur/profanity detection via naughty-words (CC-BY-4.0; attribution in
// LICENSES.md). English is handled by profanity.mjs, so it is excluded here by default. Unicode-aware
// word boundaries let non-Latin scripts match. Per-language regexes are compiled once.
import nw from "naughty-words";

export const DEFAULT_LANGS = ["es", "pt", "fr", "de", "it", "ru", "ar"];
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cache = new Map();

function langRe(lang) {
  if (cache.has(lang)) return cache.get(lang);
  const words = (nw[lang] || []).filter(Boolean).map(esc);
  const re = words.length ? new RegExp("(?<![\\p{L}\\p{N}])(" + words.join("|") + ")(?![\\p{L}\\p{N}])", "giu") : null;
  cache.set(lang, re);
  return re;
}

/** @returns {Array<{source:"wordlist",detector:string,label:"slur",span:[number,number],matched:string,score:1,category:"profanity",language:string}>} */
export function detect(text, { langs = DEFAULT_LANGS } = {}) {
  const flags = [];
  for (const lang of langs) {
    const re = langRe(lang);
    if (!re) continue;
    for (const m of text.matchAll(re)) {
      flags.push({ source: "wordlist", detector: "naughty-words:" + lang, label: "slur", span: [m.index, m.index + m[0].length], matched: m[0], score: 1, category: "profanity", language: lang });
    }
  }
  return flags;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node reference/detectors/wordlists.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add reference/detectors/wordlists.mjs reference/detectors/wordlists.test.mjs
git commit -m "feat(detectors): naughty-words multilingual slur detection (Unicode boundaries)"
```

---

### Task 8: Spam / scam heuristics adapter

**Files:**
- Create: `reference/detectors/spam.mjs`
- Test: `reference/detectors/spam.test.mjs`

**Interfaces:**
- Produces:
  - `DEFAULT_CONFIG = { shorteners: string[], keywords: string[] }` (exported, overridable).
  - `detect(text, opts?: { config?: typeof DEFAULT_CONFIG }) => Flag[]`, `source:"rule"`,
    `category:"spam"`, labels `SHORTENER` (detector `spam.shortener`) and `SCAM_KEYWORD`
    (detector `spam.keyword`).

- [ ] **Step 1: Write the failing test** — `reference/detectors/spam.test.mjs`:

```js
// Run: node reference/detectors/spam.test.mjs
import { detect } from "./spam.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

const t = "you won a free prize claim at bit.ly/abc now";
const fs = detect(t);
const sh = fs.find((f) => f.label === "SHORTENER");
ok(sh && t.slice(sh.span[0], sh.span[1]).startsWith("bit.ly/"), "shortener span");
const kw = fs.find((f) => f.label === "SCAM_KEYWORD" && f.matched === "free prize");
ok(kw && t.slice(kw.span[0], kw.span[1]) === "free prize", "scam keyword span");
ok(fs.every((f) => f.source === "rule" && f.category === "spam"), "spam flag shape");
ok(detect("meeting notes for tuesday").length === 0, "clean -> no flags");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node reference/detectors/spam.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `reference/detectors/spam.mjs`:**

```js
// Spam/scam heuristics: URL shorteners + configurable scam keyword phrases. Configurable lists so a
// consumer can tune precision. Deterministic, span-accurate.
export const DEFAULT_CONFIG = {
  shorteners: ["bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "buff.ly", "is.gd"],
  keywords: ["free prize", "you won", "act now", "wire transfer", "gift card", "crypto giveaway", "claim your"],
};
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** @returns {Array<{source:"rule",detector:string,label:string,span:[number,number],matched:string,score:1,category:"spam"}>} */
export function detect(text, { config = DEFAULT_CONFIG } = {}) {
  const flags = [];
  const shRe = new RegExp("\\b(?:" + config.shorteners.map(esc).join("|") + ")\\/\\S+", "gi");
  for (const m of text.matchAll(shRe)) flags.push({ source: "rule", detector: "spam.shortener", label: "SHORTENER", span: [m.index, m.index + m[0].length], matched: m[0], score: 1, category: "spam" });
  const kwRe = new RegExp("\\b(" + config.keywords.map(esc).join("|") + ")\\b", "gi");
  for (const m of text.matchAll(kwRe)) flags.push({ source: "rule", detector: "spam.keyword", label: "SCAM_KEYWORD", span: [m.index, m.index + m[0].length], matched: m[0], score: 1, category: "spam" });
  return flags;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node reference/detectors/spam.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add reference/detectors/spam.mjs reference/detectors/spam.test.mjs
git commit -m "feat(detectors): spam/scam heuristics (shorteners + keyword phrases)"
```

---

### Task 9: Detector registry + `detect()` with span remap

**Files:**
- Create: `reference/detectors/index.mjs`
- Test: `reference/detectors/index.test.mjs`

**Interfaces:**
- Consumes: the eight adapter modules (`validator`, `phone`, `ipaddr`, `presidio`, `profanity`,
  `wordlists`, `spam`) via `detect(text, opts)`.
- Produces:
  - `DETECTORS: Array<{ name: string, detect: (text, opts) => Flag[] }>` — the registry, in order.
  - `detect(text: string, opts?: { map?: OffsetMap, enabled?: Record<string,boolean>, detectorOpts?: object }) => Flag[]`
    — runs each enabled detector on `text`; when `map` is provided, every flag's `span` is remapped via
    `map.toOriginal(...)` so spans point at original text. `enabled` defaults to all-true; a detector
    whose entry is `false` is skipped. A detector that throws is skipped (isolated), never aborts others.

- [ ] **Step 1: Write the failing test** — `reference/detectors/index.test.mjs`:

```js
// Run: node reference/detectors/index.test.mjs
import { detect, DETECTORS } from "./index.mjs";
import { normalize } from "../normalize.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

// registry holds all seven adapters
ok(DETECTORS.length === 7, "seven detectors registered");

// without a map: spans are in the passed text's coords
const t = "mail joe@example.com now";
const fs = detect(t);
const email = fs.find((f) => f.label === "EMAIL");
ok(email && t.slice(email.span[0], email.span[1]) === "joe@example.com", "no-map span in text coords");

// with a map: an obfuscated email is caught on normalized text but the span points at ORIGINAL text
const raw = "mail joe@exＡmple.com now"; // fullwidth A in the domain
const { normalized, map } = normalize(raw);
const fs2 = detect(normalized, { map });
const e2 = fs2.find((f) => f.label === "EMAIL");
ok(e2 && raw.slice(e2.span[0], e2.span[1]) === "joe@exＡmple.com", "mapped span points at ORIGINAL obfuscated text");

// disabled detector produces nothing
const off = detect(t, { enabled: { validator: false } });
ok(!off.some((f) => f.detector.startsWith("validator")), "disabled detector skipped");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node reference/detectors/index.test.mjs`
Expected: FAIL — `./index.mjs` not found.

- [ ] **Step 3: Implement `reference/detectors/index.mjs`:**

```js
// Detector registry + the unified detect(): run each enabled detector, and (given a normalization map)
// remap every span from normalized coords back to ORIGINAL-text coords. Detector failures are isolated.
import * as validator from "./validator.mjs";
import * as phone from "./phone.mjs";
import * as ipaddr from "./ipaddr.mjs";
import * as presidio from "./presidio.mjs";
import * as profanity from "./profanity.mjs";
import * as wordlists from "./wordlists.mjs";
import * as spam from "./spam.mjs";

export const DETECTORS = [
  { name: "validator", detect: validator.detect },
  { name: "phone", detect: phone.detect },
  { name: "ipaddr", detect: ipaddr.detect },
  { name: "presidio", detect: presidio.detect },
  { name: "profanity", detect: profanity.detect },
  { name: "wordlists", detect: wordlists.detect },
  { name: "spam", detect: spam.detect },
];

/**
 * @param {string} text
 * @param {{ map?: {toOriginal(a:number,b:number):[number,number]}, enabled?: Record<string,boolean>, detectorOpts?: Record<string,object>, onError?: (e:unknown, name:string)=>void }} [opts]
 * @returns {Array<object>} flags with spans in ORIGINAL coords when `map` is supplied
 */
export function detect(text, { map, enabled, detectorOpts = {}, onError } = {}) {
  const out = [];
  for (const d of DETECTORS) {
    if (enabled && enabled[d.name] === false) continue;
    let flags;
    try { flags = d.detect(text, detectorOpts[d.name]); }
    catch (e) { onError?.(e, d.name); continue; }
    for (const f of flags) {
      const span = map ? map.toOriginal(f.span[0], f.span[1]) : f.span;
      out.push({ ...f, span });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node reference/detectors/index.test.mjs`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add reference/detectors/index.mjs reference/detectors/index.test.mjs
git commit -m "feat(detectors): registry + unified detect() with original-coord span remap"
```

---

### Task 10: `LICENSES.md` + aggregate test runner

**Files:**
- Create: `LICENSES.md`
- Modify: `package.json` (add a `test:detectors` script; add `LICENSES.md` to `files`)

**Interfaces:** none new — documents license vetting and wires the node-based detector tests into a
single command.

- [ ] **Step 1: Create `LICENSES.md`:**

```markdown
# Third-party licenses — deterministic detectors

All runtime detector dependencies are MIT or otherwise permissive (no GPL/AGPL/CC-BY-NC/OpenRAIL).
Verified against each package's own `package.json` / license file at install time.

| Dependency | Version | License | Used by | Notes |
|---|---|---|---|---|
| validator | ^13.15.35 | MIT | `detectors/validator.mjs` | EMAIL/URL/CREDITCARD validation |
| google-libphonenumber | ^3.2.44 | MIT AND Apache-2.0 | `detectors/phone.mjs` | phone parse/validate; both terms permissive |
| ipaddr.js | ^2.4.0 | MIT | `detectors/ipaddr.mjs` | IPv4/IPv6 validate + classify |
| obscenity | ^0.4.6 | MIT | `detectors/profanity.mjs` | substitution-aware English profanity |
| leo-profanity | ^1.9.0 | MIT | `detectors/profanity.mjs` | secondary English word list |
| naughty-words | ^1.2.0 | CC-BY-4.0 | `detectors/wordlists.mjs` | multilingual lists — **attribution required** (this file) |
| unhomoglyph | ^1.0.6 | MIT | `normalize.mjs` | confusable → ASCII skeleton |

**Attribution (CC-BY-4.0):** multilingual word lists are derived from the `naughty-words` package,
which packages the "List of Dirty, Naughty, Obscene, and Otherwise Bad Words" (CC-BY-4.0).

Presidio-style regexes in `detectors/presidio.mjs` are original patterns inspired by Microsoft Presidio
(MIT); no Presidio code is vendored.
```

- [ ] **Step 2: Add a `test:detectors` script to `package.json`.** Merge into `scripts`:

```json
{
  "scripts": {
    "test": "node reference/validate.test.mjs && vitest run",
    "test:detectors": "node reference/normalize.test.mjs && node reference/detectors/validator.test.mjs && node reference/detectors/phone.test.mjs && node reference/detectors/ipaddr.test.mjs && node reference/detectors/presidio.test.mjs && node reference/detectors/profanity.test.mjs && node reference/detectors/wordlists.test.mjs && node reference/detectors/spam.test.mjs && node reference/detectors/index.test.mjs"
  }
}
```

Also add `"LICENSES.md"` to the `files` array.

- [ ] **Step 3: Run the whole detector suite**

Run: `npm run test:detectors`
Expected: every file prints `ALL PASS`.

- [ ] **Step 4: Commit**

```bash
git add LICENSES.md package.json
git commit -m "docs(licenses): vet detector deps + aggregate detector test runner"
```

---

## Self-Review

**Spec coverage (Task 1 + Task 2 of the design spec):**
- normalize() NFKC + unhomoglyph + optional lowercase + offset map → Task 1. ✓
- Structured PII (validator email/URL/IP/card + Luhn; libphonenumber; ipaddr; Presidio SSN/IBAN/etc.) →
  Tasks 2–5 (IP owned by ipaddr, email/URL/card by validator — division noted). ✓
- Profanity/slurs multilingual (obscenity, leo-profanity, naughty-words) → Tasks 6–7. ✓
- Spam/scam heuristics (configurable lists) → Task 8. ✓
- Common `detect()` interface + original-coord spans → Task 9. ✓
- LICENSES.md vetting → Task 10. ✓

**Placeholder scan:** every step shows full code + exact run command + expected output. No TBD/TODO. ✓

**Type consistency:** the `Flag` shape (`source`, `detector`, `label`, `span:[number,number]`, `matched`,
`score`, `category`, optional `language`/`suggestion`/`range`) is identical across Tasks 2–9; `detect()`
signatures match between each adapter and the registry's dispatch in Task 9. `map.toOriginal` matches the
`OffsetMap` produced in Task 1. ✓
