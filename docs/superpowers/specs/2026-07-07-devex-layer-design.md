# FELA Moderator — DevEx Layer Design

**Date:** 2026-07-07
**Status:** Approved (brainstorm), pending implementation plan

## Goal

Make the FELA moderator SDK the kind of client-side library JS/TS developers *love* to
install and evangelize — not by adding moderation features, but by nailing developer
experience, composability, theming, and a sellable demo. The moderation core
(`check()`, the neural model, the FOSS checkers) is unchanged. This work is entirely
about the surface developers touch.

**Mission constraint (drives the default):** "No content makes it to your backend that
you don't want to hold." The zero-config default must block both PII and toxicity.

**Non-goals:** more detection features; a large configuration surface; per-entity policy
DSLs; a preset library. Simplicity and composability over configurability.

## The core mental model — four layered entry points

Each layer is the escape hatch for the one above it. A developer enters at whatever layer
matches their comfort level. Crucially, **Layer 2 is a thin readable component built on
Layer 1, and Layer 3 hands the developer that same file** — so "drop-in" and "own every
pixel" are the same code, not two codebases.

```
Layer 0  check(text, policy)          pure function — Node / RN / web / backend (exists today)
Layer 1  useModeration(text, policy)  headless React hook — findings + state + resolve()
Layer 2  <ModeratedTextarea>          batteries-included styled component — where ~90% of devs live
Layer 3  npx @lowdown/moderate add …  ejects Layer 2's source into the dev's repo — they own it
```

The framework-free `<fela-moderated-input>` web component remains the no-build path,
upgraded to emit the same events and carry the same `finding` shape.

## Policy — two knobs, nothing else

```ts
type Severity = "block" | "warn" | "off"
type Policy = { pii: Severity; toxicity: Severity }

const DEFAULT_POLICY: Policy = { pii: "block", toxicity: "block" }
```

- `<ModeratedTextarea />` with **no props** already blocks both PII and toxicity — the safe
  default is the zero-config path, satisfying the mission constraint.
- Softening is one line: `policy={{ pii: "warn", toxicity: "block" }}`.
- **No presets, no per-entity configuration.** Detection stays granular (findings carry the
  specific entity type, e.g. `phonenumber`), but the *control knob* is coarse: two dials.
- `"block"` → gate submit, surface reason. `"warn"` → surface but allow (optionally via the
  async resolver). `"off"` → detect but do nothing (findings still emitted for analytics).

### Behavior mapping

| Policy value | Submit gating | UI surfaced | Findings emitted |
|---|---|---|---|
| `block` | disabled while findings present | yes (banner/inline) | yes |
| `warn`  | allowed (or resolver-gated) | yes | yes |
| `off`   | allowed | no default UI | yes (for callbacks/analytics) |

## The shared currency — the `finding` object

Every layer and every wire-in style reads the same stable, documented object:

```ts
type Finding = {
  category: "pii" | "toxicity"     // maps to the policy knob
  type: string                     // specific entity, e.g. "phonenumber", "email", "obscene"
  severity: Severity               // resolved from policy for this category
  text: string                     // the offending substring
  start: number                    // UTF-16 offset (for inline highlighting)
  end: number
  source: "regex" | "model"        // structured (FOSS) vs neural
  suggestion?: string              // e.g. redacted form "555-***-****" when available
}
```

## Wire-in surface — four coexisting styles, most-loved first

The developer chooses; nothing is mutually exclusive. All read off `Finding[]`.

**A. Callbacks (default).** Plain props, no async ceremony.
```jsx
<ModeratedTextarea
  onBlocked={findings => toast.error("Remove the phone number to send")}
  onWarn={findings => analytics.track("pii_warned", findings)}
  onClean={() => setCanSend(true)}
/>
```

**B. Async decision resolver (the "wire in my own modal" headline).** Return a decision from
any UI the dev wants; the SDK orchestrates, the UI is 100% theirs.
```jsx
<ModeratedTextarea
  onFlagged={async findings => await myConfirmDialog(findings)} // → "send" | "block" | "redact"
/>
```

**C. Render-prop slots (inline coaching UI).** Replace default banner/pills with own JSX.
```jsx
<ModeratedTextarea renderBlocked={findings => <MyBanner items={findings} />} />
```

**D. Headless hook (build everything).** The floor; A–C are built on this.
```jsx
const { findings, blocked, resolve } = useModeration(text, policy)
```

Web component parity: `el.addEventListener('flagged', e => { const { findings, decide } = e.detail })`.

### Resolver decision contract

`onFlagged` (and web `decide`) resolves to one of:
- `"send"` — allow submit despite findings (warn-style override).
- `"block"` — keep gated.
- `"redact"` — apply each finding's `suggestion` to the text, then allow. If any finding
  lacks a `suggestion`, that span is left as-is and the result is re-checked (may stay gated).

## Theming — three tiers, no CSS-in-JS lock-in

1. **CSS custom properties** for the 80% case: `--fela-warn`, `--fela-block`, `--fela-radius`,
   `--fela-font`, etc. One line to rebrand.
2. **`::part()` + `data-*`**: `part="input|banner|finding"`, `data-severity="warn|block"`,
   `data-category="pii|toxicity"`. Full CSS control, zero JS.
3. **`classNames={{ root, input, banner, finding }}` slots** on the React component for
   Tailwind/shadcn users. In shadcn/eject mode the component ships **unstyled-by-default** so
   it inherits the host design tokens automatically.

## Distribution — the shadcn eject path (Layer 3)

`npx @lowdown/moderate add moderated-textarea` copies the component `.tsx` into the dev's repo
(e.g. `components/ui/moderated-textarea.tsx`), wired to import `useModeration()` from the
package. The dev owns and restyles it; zero lock-in. This file is the *same source* shipped as
Layer 2, keeping maintenance single-sourced.

## Demo + README screenshots (the sellable artifact)

- `demo/chat/` — a two-sided "Customer ⇄ Courier" chat mock, styled with **Tailwind + shadcn,
  isolated to the demo** (never a dependency of the SDK core).
- Flow: typing "call me at 555-123-4567" highlights the phone number inline, gates the send
  button, and offers a warn dialog: **Send anyway / Redact to `555-***-****` / Cancel** —
  exercising callbacks + async resolver + inline highlighting in one screen.
- Doubles as demo, screenshot source, and copy-paste example.
- **Screenshots are captured headlessly via Playwright**, 3–4 states (clean, warned-inline,
  block-banner, redact-confirm), committed to `demo/chat/shots/` and referenced in the README.
  Reproducible — regenerate on any UI change.
- **Live playground** — an "Open in StackBlitz" button in the README pointing at `demo/chat/`,
  so a dev can try the SDK in ~10 seconds without cloning. The demo is structured to boot
  directly in StackBlitz's WebContainer (standard Vite + Tailwind project layout, no native
  build steps in the demo path). This is the single highest-leverage goodwill lever: it turns
  "read the README" into "type in the box and watch it gate."

## Component units (isolation & testability)

- `useModeration(text, policy)` — headless hook. In: text + policy (+ optional neural
  moderator). Out: `{ findings, blocked, warned, resolve, getInputProps }`. Depends on
  `check()`. Testable with plain strings, no DOM.
- `<ModeratedTextarea>` — styled component over the hook. Owns default banner/inline UI +
  slot/callback wiring. Depends on the hook only.
- `<fela-moderated-input>` — web component, mirrors the hook's contract via events.
- CLI `add` command — file copier. No runtime dependency on the SDK.
- Demo app — consumes the public API exactly as a real dev would (dogfoods the DevEx).

## Error handling

- Model load / inference failure → **fail-open on the neural path** (regex still gates); log
  via an optional `onError` callback. Preserves today's behavior.
- Resolver rejection / throw → treat as `"block"` (safe default), surface via `onError`.
- Empty/whitespace text → no findings, not blocked.

## Testing

- Hook: unit tests over `useModeration` for each policy value × category, resolver decisions
  (send/block/redact), and redaction-without-suggestion edge case.
- Component: render tests for gating, banner visibility, slot override, callback firing.
- Web component: event emission + `decide()` contract.
- Demo: Playwright script that both captures screenshots and asserts the four states render.

## Open items for the implementation plan

- Exact `getInputProps()` shape and controlled/uncontrolled handling.
- CLI packaging (bin entry, file registry) — keep minimal.
- Which neural-moderator loader story the demo uses (regex-only is fine for screenshots).
