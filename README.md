<div align="center">

# 🛡️ FELA Moderator

### The submit-time content gate that keeps PII & toxicity off your backend.

**One install. Two knobs. Zero data leaves the device.** 📵

`pii` and `toxicity`, each `block · warn · off` — default **block**. So nothing you don't want
to hold ever reaches your server. Runs client-side on 📱 React Native, 🌐 web, and 🟢 Node — fully offline.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/Lowdown-Labs/fela_moderator?file=demo/chat/src/App.tsx)

`npm i @lowdown/moderate` &nbsp;·&nbsp; 🪶 13 MB model &nbsp;·&nbsp; ⚡ ~22 ms/check &nbsp;·&nbsp; 🎯 0.977 AUROC &nbsp;·&nbsp; 🔒 on-device

</div>

---

## 👀 See it in action

A courier chat 🛵 — type a phone number and watch it **highlight inline**, **gate the Send button**,
and pop *your own* dialog: **Redact & send / Send anyway / Cancel**.

| ✅ Clean | 🖍️ Highlighted | 💬 Your dialog | 🥷 Redacted |
|:---:|:---:|:---:|:---:|
| ![clean](demo/chat/shots/01-clean.png) | ![highlighted](demo/chat/shots/02-highlighted.png) | ![dialog](demo/chat/shots/03-dialog.png) | ![redacted](demo/chat/shots/04-redacted.png) |

> 🏃 **Run it locally:** `npm --prefix demo/chat install && npm --prefix demo/chat run dev`

---

## 🧩 Use it — pick your layer

Enter at whatever layer fits your brain. Each one is the escape hatch for the one above. 🪜

### 1️⃣ Drop-in component — blocks both by default (the mission default)
```tsx
import { ModeratedTextarea } from "@lowdown/moderate/react";

<ModeratedTextarea onBlocked={() => setCanSend(false)} onClean={() => setCanSend(true)} />
```

### 2️⃣ Soften a knob — one line, no per-entity config 🎛️
```tsx
<ModeratedTextarea policy={{ pii: "warn", toxicity: "block" }} />
```

### 3️⃣ Wire in your own dialog — return a decision from *any* UI 💬
```tsx
const ref = useRef<ModeratedTextareaHandle>(null);

<ModeratedTextarea ref={ref} onFlagged={async (findings) => await myDialog(findings)} />;
// on send: const d = await ref.current.guardSubmit();  // → "send" | "redact" | "block"
```

### 4️⃣ Headless hook — build the whole thing yourself 🔧
```tsx
const { findings, blocked, redact, guardSubmit } = useModeration(text, { policy });
```

### 5️⃣ Own the component — eject the source & restyle freely (shadcn-style) 📦
```bash
npx @lowdown/moderate add moderated-textarea
```

### 🌍 No framework? Plain HTML5 custom element, no build step
```html
<script type="module" src="fela-moderated-input.js"></script>
<fela-moderated-input placeholder="Say something…"></fela-moderated-input>
<script type="module">
  el.addEventListener("flagged", (e) => myDialog(e.detail.findings).then(e.detail.decide));
</script>
```

### 🧠 Backend / anywhere — just the function
```js
import { check } from "@lowdown/moderate";
if (check(text).blocked) return reject("contains PII or obscenity");
```

---

## 🎨 Make it yours (theming)

Three ways, no CSS-in-JS lock-in:

- 🖌️ **CSS custom props** — `--fela-block`, `--fela-warn`, `--fela-radius`. One line to rebrand.
- 🧬 **`::part()` + `data-*`** — `part="input | banner | finding"`, `data-severity`, `data-category`.
- 🧵 **`classNames={{ root, input, banner }}` slots** — bring your Tailwind / shadcn utilities.

> In `add` / eject mode the component ships **unstyled** and inherits your design tokens automatically. ✨

---

## ⚙️ How it works (hybrid)

| Concern | Handled by | Why |
|---|---|---|
| 📇 Structured PII — email, phone, SSN, card, IP, IBAN, URL | **FOSS regex + Luhn** | deterministic, ~100% recall, zero model, zero cost |
| 🤬 Obscenity / toxicity | **neural model** (jigsaw head) | nuance a wordlist can't do; macro-AUROC **0.977** |
| 🕵️ Unstructured PII — names, addresses, job titles | **neural model** (PII head) | regex can't; the model owns these entity types |

`check()` merges both and returns `{ findings, blocked, warned }` — each finding is
`{ category, type, severity, text, start, end, source, suggestion? }`. Structured entities the model
emits are dropped (the FOSS checkers own those, more reliably). Regex runs instantly; the model is an
optional async hook (load the tflite/onnx once via onnxruntime-web or tflite-web). 🔌

---

## 📊 Numbers (measured, not vibes)

- 🪶 **13 MB** int8 model — 3.4× smaller than fp32, accuracy-preserving.
- 🎯 **macro-AUROC 0.977** on 15k of the official Jigsaw scored test (int8; fp32/card agree at 0.9775/0.9773).
- ⚡ **~22 ms / 512-byte window** on an x86 dev box (a phone is ~3–8× slower — still fine per-submit).
- 🧮 **~200× less compute per check** than a 3B on-device LLM's forward pass (6.75 GMACs vs ~1.5 TMACs).

---

## 🗂️ What's in the box

- `reference/moderate.mjs` — byte-encode, byte↔UTF-16 offset mapping, PII spans, redaction, toxicity.
- `reference/checkers.mjs` — FOSS structured-PII regex/validators.
- `reference/validate.mjs` — the `check()` gate. `validate.test.mjs` → `node validate.test.mjs` (all pass ✅).
- `react/useModeration.ts` — the headless hook. `react/ModeratedTextarea.tsx` — the styled component.
- `web/fela-moderated-input.js` — the zero-build custom element.
- `bin/moderate.mjs` — the `moderate add` CLI (eject a component into your repo).
- `demo/chat/` — the polished Vite + Tailwind courier-chat demo (source of the screenshots above 📸).
- `SPEC.md` — the full on-device inference + windowing + redaction spec.

---

## 🤝 Honesty

Toxicity is strong and license-cleaner (Jigsaw CC0 + permissive sources). **PII precision is
approximate** on free-form text — the model's byte-BIO boundaries are ragged (int8 == fp32, so it's the
tiny model, not quantization). Great for a *gate* (recall of "is there PII?"), rough for precise
extraction — which is exactly why structured PII is regex. ⚠️ The PII head's training data (ai4privacy)
is non-commercial-gated — **retrain PII on a permissive source before commercial release.**

<div align="center">

Made with 🛡️ by **Lowdown Labs** · keep your users' secrets secret.

</div>
