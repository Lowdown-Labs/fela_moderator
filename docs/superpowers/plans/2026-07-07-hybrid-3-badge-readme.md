# Hybrid Engine — Plan 3: `<ModerationBadge>` + README

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the explainability UI (`<ModerationBadge>` that reveals each structured reason on hover/focus) and rewrite the README around the hybrid, explainable-by-default architecture — including a "plug into the validator you already use" section and a measured latency table.

**Architecture:** `<ModerationBadge>` is a pure presentational component over a `ModerationResult` — it renders `explainReason()` per reason, themed with the existing `part`/`data-*`/CSS-var conventions. The README additions are documentation only. Depends on Plans 1–2.

**Tech Stack:** TypeScript React (`.tsx`), Vitest + @testing-library/react (existing toolchain). Markdown for the README.

## Global Constraints

- **Presentational only.** `<ModerationBadge>` contains no detection logic — it reads a `ModerationResult` and calls `explainReason()`. Fail-safe: a clean result renders a "clean" state, never a tooltip.
- **Theming parity** with the existing components: `part="badge"`/`part="badge-tip"`, `data-flagged`, CSS custom properties from `react/fela.css`.
- **Accessible:** focusable (`tabIndex={0}`), `role="button"` with an `aria-label`, tooltip via `role="tooltip"`; reasons reveal on both hover and keyboard focus.
- **README claims must be honest** — latency numbers come from `npm run bench` output, not invented.

---

### Task 1: `<ModerationBadge>` component

**Files:**
- Create: `react/ModerationBadge.tsx`
- Create: `react/ModerationBadge.test.tsx`
- Create: `reference/explain.d.ts`
- Modify: `react/fela.css` (append badge styles)
- Modify: `react/index.ts` (export the badge)

**Interfaces:**
- Consumes: `explainReason` (`../reference/explain.mjs`, typed via new `explain.d.ts`); `ModerationResult`
  from `./types`.
- Produces: `ModerationBadge({ result, className? })` and `ModerationBadgeProps`.

- [ ] **Step 1: Write the failing test** — `react/ModerationBadge.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModerationBadge } from "./ModerationBadge";
import { moderate } from "../reference/engine.mjs";

describe("<ModerationBadge>", () => {
  it("shows the reason count and reveals the why on hover", () => {
    render(<ModerationBadge result={moderate("mail joe@example.com")} />);
    const badge = screen.getByRole("button");
    expect(badge).toHaveAttribute("data-flagged", "true");
    fireEvent.mouseEnter(badge);
    expect(screen.getByRole("tooltip").textContent).toContain("EMAIL");
  });

  it("reveals the why on keyboard focus too", () => {
    render(<ModerationBadge result={moderate("mail joe@example.com")} />);
    fireEvent.focus(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("clean result shows a clean state and no tooltip", () => {
    render(<ModerationBadge result={moderate("a friendly hello")} />);
    const badge = screen.getByRole("button");
    expect(badge).toHaveAttribute("data-flagged", "false");
    fireEvent.mouseEnter(badge);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run react/ModerationBadge.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `reference/explain.d.ts`:**

```ts
import type { Reason, ModerationResult } from "../react/types";
export function explainReason(reason: Reason): string;
export function explain(result: ModerationResult): string;
```

- [ ] **Step 4: Implement `react/ModerationBadge.tsx`:**

```tsx
import { useState } from "react";
import { explainReason } from "../reference/explain.mjs";
import type { ModerationResult } from "./types";
import "./fela.css";

export interface ModerationBadgeProps {
  result: ModerationResult;
  className?: string;
}

/** A pill that shows moderation state and reveals each structured reason ("why") on hover/focus. */
export function ModerationBadge({ result, className }: ModerationBadgeProps) {
  const [open, setOpen] = useState(false);
  const count = result.reasons.length;
  const show = open && result.flagged;
  return (
    <span
      className={"fela-badge" + (className ? " " + className : "")}
      part="badge"
      data-flagged={result.flagged}
      tabIndex={0}
      role="button"
      aria-label={result.flagged ? `Moderation: ${count} reason${count === 1 ? "" : "s"}. Focus to see why.` : "Moderation: clean"}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {result.flagged ? `⚠ ${count} reason${count === 1 ? "" : "s"}` : "✓ clean"}
      {show && (
        <ul className="fela-badge-tip" part="badge-tip" role="tooltip">
          {result.reasons.map((r, i) => <li key={i}>{explainReason(r)}</li>)}
        </ul>
      )}
    </span>
  );
}
```

- [ ] **Step 5: Append badge styles to `react/fela.css`:**

```css
.fela-badge { position: relative; display: inline-flex; align-items: center; gap: .25rem; font: var(--fela-font); font-size: .85em; padding: .1rem .5rem; border-radius: 999px; cursor: default; }
.fela-badge[data-flagged="true"] { color: var(--fela-block); background: color-mix(in srgb, var(--fela-block) 12%, transparent); }
.fela-badge[data-flagged="false"] { color: #16794a; background: color-mix(in srgb, #16794a 12%, transparent); }
.fela-badge-tip { position: absolute; top: 100%; left: 0; margin: .25rem 0 0; padding: .4rem .6rem; list-style: none; background: #111; color: #fff; border-radius: 6px; font-size: .8em; max-width: 24rem; z-index: 10; }
.fela-badge-tip li { margin: .15rem 0; white-space: normal; }
```

- [ ] **Step 6: Export from `react/index.ts`.** Add:

```ts
export { ModerationBadge } from "./ModerationBadge";
export type { ModerationBadgeProps } from "./ModerationBadge";
```

- [ ] **Step 7: Run to verify pass**

Run: `npx vitest run react/ModerationBadge.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add react/ModerationBadge.tsx react/ModerationBadge.test.tsx react/fela.css react/index.ts reference/explain.d.ts
git commit -m "feat(react): <ModerationBadge> — structured reasons on hover/focus"
```

---

### Task 2: README — hybrid architecture, explainability, validation adapters, latency

**Files:**
- Modify: `README.md`

**Interfaces:** documentation only.

- [ ] **Step 1: Capture real latency numbers.** Run the benchmark and keep the output to fill the table
  in Step 4:

Run: `npm run bench`
Expected: a printed `tool / p50 / p95` table plus `normalize` and `moderate` rows. Copy these numbers.

- [ ] **Step 2: Replace the "⚙️ How it works (hybrid)" section** in `README.md` with the hybrid
  pipeline + explainability pitch. Find the section starting `## ⚙️ How it works (hybrid)` and replace
  through the end of its trailing paragraph with:

````markdown
## ⚙️ How it works (hybrid + explainable)

```
             ┌─────────────── normalize(text) ───────────────┐
  raw text → │  NFKC + un-homoglyph (+ offset map to original) │
             └───────────────────────┬────────────────────────┘
             materiality gate:  raw ≡ normalized?  ── no ─┐
                     │ yes                                 │  (obfuscated)
                     ▼                                     ▼
        ┌── detectors (raw) ──┐             ┌── detectors (raw ∪ normalized) ──┐
        │ validator.js · phone │            │  spans mapped back to ORIGINAL    │
        │ ipaddr · presidio    │            └───────────────────┬───────────────┘
        │ obscenity · naughty  │                                │
        │ spam heuristics      │        FELA byte-model (RAW) ──┤
        └──────────┬───────────┘         toxicity · PII · …     │
                   └───────────────┬──────────────────────────┘
                                   ▼
                      merge: union · PII dedupe (prefer validated rule span)
                             · corroboration boost · head enable-flags
                                   ▼
                         ModerationResult { flagged, categories,
                           piiSpans, reasons[], normalizedText }
```

**Explainable by default.** Every flag carries a structured `Reason` —
`{ source, detector, label, span, matched, score, language }` — pointing at your *original* text (even
when the hit was found on the normalized form). `explain(result)` renders them in plain English:

```js
import { moderate, explain } from "@lowdown/moderate";

const result = moderate("mail joe@example.com and Ⅴ1@gⓡ@");
explain(result);
// "Flagged EMAIL (rule, 1.00) via validator.email 'joe@example.com' at chars 5–20; …"
```

| Concern | Handled by | Why |
|---|---|---|
| 📇 Structured PII — email, phone, card, IP, SSN, IBAN, crypto | **MIT rule detectors** (validator.js, google-libphonenumber, ipaddr.js, Presidio-style regex) | deterministic, validated, exact spans |
| 🌐 Obfuscation — homoglyphs, full-width, circled, leetspeak | **normalize() + substitution-aware matching** | canonicalized before rules & model |
| 🤬 Profanity / slurs (multilingual) | **obscenity + leo-profanity + naughty-words** | non-English handled deterministically |
| 🧠 Toxicity + unstructured PII (names/addresses) | **FELA byte-model** | nuance/semantics a wordlist can't do |

New model heads (spam, jailbreak, NSFW-severity, target-identity) are pre-registered and ship **disabled
until they pass our eval gate** — flip one flag to enable, no code change.
````

- [ ] **Step 3: Add a "plug into your validator" section** immediately after the How-it-works section:

````markdown
## 🔌 If you love Zod / Valibot / ArkType / validator.js…

Moderation becomes **one rule** in the validation you already run — web or React Native, no server. We
implement [Standard Schema](https://standardschema.dev), so the same adapter drops into Zod, Valibot,
and ArkType (zero extra dependency):

```ts
import { z } from "zod";
import { moderationSchema, zodRefine } from "@lowdown/moderate/schema";

// Standard Schema — works with Zod / Valibot / ArkType and @hookform/resolvers
const Message = z.object({ body: z.string() }).and(z.custom(v => moderationSchema()["~standard"].validate(v)));

// …or a Zod refinement, if you're already deep in Zod:
const Body = z.string().superRefine(zodRefine({ /* policy/config */ }));
```

The rejected field's error message **is** the structured reason — the "why" flows straight into your
existing error UI. (Under the hood we already validate structured PII *with* validator.js, so if that's
your tool, you're covered too.)
````

- [ ] **Step 4: Add the "What you pay" latency section** after the "📊 Numbers" section, filling the
  numbers captured in Step 1 (replace the `<…>` placeholders with the measured values):

````markdown
## ⏱️ What you pay (measured, per gate)

Regenerate any time with `npm run bench`. The normalization gate means **plain text pays almost nothing**
— the second detector pass only runs when the input is actually obfuscated.

| Stage | p50 | p95 |
|---|---|---|
| `normalize()` | <normalize.p50> ms | <normalize.p95> ms |
| validator.js | <validator.p50> ms | <validator.p95> ms |
| google-libphonenumber | <phone.p50> ms | <phone.p95> ms |
| ipaddr.js | <ipaddr.p50> ms | <ipaddr.p95> ms |
| Presidio regex | <presidio.p50> ms | <presidio.p95> ms |
| obscenity + leo | <profanity.p50> ms | <profanity.p95> ms |
| naughty-words (multilingual) | <wordlists.p50> ms | <wordlists.p95> ms |
| spam heuristics | <spam.p50> ms | <spam.p95> ms |
| **`moderate()` end-to-end (model off)** | **<moderate.p50> ms** | **<moderate.p95> ms** |

Any tool that costs more than its signal is worth can be shipped disabled via the head registry
(`config.heads`) — the SDK stays lean and fast.
````

- [ ] **Step 5: Update the honesty/licensing note.** In the `## 🤝 Honesty` section, add one line:

```markdown
All added detector dependencies are MIT/permissive (see `LICENSES.md`); multilingual word lists are
CC-BY-4.0 (attributed there). No network calls — text never leaves the device.
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs(readme): hybrid+explainable architecture, validator adapters, latency table"
```

---

### Task 3: Full-suite green + React type-check

**Files:** none new — verifies the whole surface builds and passes together.

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all node detector/engine/explain/schema/gate suites print `ALL PASS`; every vitest suite green
(including the new `ModerationBadge` tests and all pre-existing DevEx tests).

- [ ] **Step 2: Type-check the React layer**

Run: `npx tsc --noEmit --jsx react-jsx --moduleResolution bundler --module esnext --target es2020 --allowJs --skipLibCheck react/index.ts`
Expected: no errors. (If importing `../reference/explain.mjs` errors, confirm `reference/explain.d.ts`
from Plan 3 Task 1 exists alongside it.)

- [ ] **Step 3: Smoke-check the public engine import graph**

Run: `node --input-type=module -e "import { moderate, explain } from './reference/validate.mjs'; const r = moderate('mail joe@example.com and Ⅴ1@gⓡ@'); if (!r.flagged) { console.error('FAIL: not flagged'); process.exit(1); } if (!r.reasons.every(x => !x.span || 'mail joe@example.com and Ⅴ1@gⓡ@'.slice(x.span[0], x.span[1]).length)) { console.error('FAIL: bad span'); process.exit(1); } console.log('engine export OK:', explain(r));"`
Expected: `engine export OK: Flagged …`.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "test: full hybrid suite green + engine export/type smoke checks" --allow-empty
```

---

## Self-Review

**Spec coverage (Task 4 UI + README of the design spec):**
- `<ModerationBadge result={...}/>` reveals reasons on hover/focus, themed, accessible → Task 1. ✓
- README hybrid architecture diagram → Task 2 Step 2. ✓
- "Explainable by default" pitch + `explain()` example → Task 2 Step 2. ✓
- "If you love Zod/Valibot/ArkType/validator.js…" adapter section → Task 2 Step 3. ✓
- Measured "What you pay" latency table from `npm run bench` → Task 2 Steps 1 + 4. ✓
- Licensing/no-network honesty note → Task 2 Step 5. ✓
- Full-suite green + type-check → Task 3. ✓

**Placeholder scan:** the only `<…>` markers are the latency cells, which Step 1 explicitly fills from
`npm run bench` output — an instruction, not an unfilled requirement. All code/commands are complete. ✓

**Type consistency:** `ModerationResult`/`Reason` (Plan 2 Task 1) are consumed by `ModerationBadge`
(Task 1) and typed via `explain.d.ts`; `moderate`/`explain`/`moderationSchema`/`zodRefine` names match
Plan 2's exports (Task 7). ✓
