# Contributing

Thanks for helping make FELA Moderator better. This is a small, fast, on-device SDK — contributions
that keep it **lean, deterministic, and offline** are especially welcome.

## Setup

```bash
npm install
npm test          # 15 node-harness suites + vitest (react/web/bin)
```

## Before you open a PR

Run the same gates CI runs:

```bash
npm run lint          # ESLint (bug-catching rules)
npm run format:check  # Prettier (run `npm run format` to fix)
npm run typecheck     # tsc against the .d.ts surface
npm test              # full suite
npm run size          # bundle-size budget
npm run check:package # publint (package correctness)
npm run bench         # per-tool / per-head latency (optional)
```

## Ground rules

- **MIT/permissive dependencies only.** No GPL/AGPL/CC-BY-NC/OpenRAIL. New deps are auto-checked
  against a license allowlist on every PR; vet and record additions in `LICENSES.md`.
- **No network on the user-data path.** Detectors and the normalizer must be pure/offline — no
  `fetch`, DNS, or I/O. Text never leaves the device.
- **Tokenizer-free / byte-level** — never add a tokenizer.
- **Tests first.** Follow the existing TDD style; every detector and engine change ships with tests.
- **Match the house style** — terse and dense; Prettier (printWidth 120) owns formatting.

## Recording your change

Run `npm run changeset` and describe your change + the semver bump. The release workflow turns these
into the `CHANGELOG.md` and version PR.

## Code of Conduct

By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).
