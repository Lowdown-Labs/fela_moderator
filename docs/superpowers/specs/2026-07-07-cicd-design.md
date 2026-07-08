# FELA Moderator — CI/CD + Repo Trust Design

**Date:** 2026-07-07
**Status:** Approved (brainstorm), pending implementation plan
**Branch:** `ci-cd`

## Goal

Make the SDK **trusted** (supply-chain + security signals a consumer can verify) and **beloved**
(contributor + consumer DX), using **only free/open, GitHub-Actions-native tooling**, with a **compact
surface**: everything GitHub-specific under `.github/`, root kept clean, trust made visible through one
tidy README badge row rather than sprawl.

## Hard constraints

- **Free/open-licensed tooling only.** Semgrep **OSS** (token-free, explicit `p/` rulesets) for SAST —
  not the paid managed service; **no CodeQL** (free only for public repos, but proprietary). ESLint,
  Prettier, typescript-eslint, publint, are-the-types-wrong, size-limit, c8, Changesets are all MIT.
  Semgrep CLI is LGPL-2.1 (used as a tool in CI, never shipped in the package `files`).
- **Publish stays inert.** `package.json` remains `private: true`; the release/publish path is
  `workflow_dispatch`/merge-gated and cannot publish until `private` is removed **and** an `NPM_TOKEN`
  secret is added. Double-inert by design.
- **Preserve the terse code style** except for the one-time Prettier reformat (printWidth 120). Docs
  (`*.md`, `docs/`, `SPEC.md`) are Prettier-ignored to keep hand-authored prose intact.
- **Least privilege:** every workflow sets top-level `permissions: {}` and grants the minimum per job.
  GitHub Actions pinned to commit SHAs (Scorecard checks both).

## Workflow surface (as few files as triggers allow)

### `.github/workflows/ci.yml` — on push to `main` + PRs
Parallel jobs (each `runs-on: ubuntu-latest` unless noted):
- **test** — matrix `ubuntu × node {18,20,22}` + one `macos-latest/node20` + one `windows-latest/node20`
  (cross-platform matters: the byte↔UTF-16 span logic is string-encoding sensitive). `npm ci` → `npm test`.
- **lint** — `npm run lint` (ESLint flat) + `npm run format:check` (Prettier `--check`).
- **typecheck** — `npm run typecheck` (tsc `--noEmit`, **no** `--allowJs`, via root `tsconfig.json`).
- **coverage** — `c8` over the node engine/detector suites (`npm run test:reference`) + `vitest run
  --coverage`; prints a summary and uploads coverage artifact (Codecov optional, no token required for
  public repos via OIDC — deferred).
- **package** — `publint` + `@arethetypeswrong/cli` (validate `exports`/types are consumable) +
  `size-limit` (bundle budget). Would have caught the untyped-main-entry bug.
- **security** — Semgrep OSS (`semgrep scan --config p/javascript --config p/security-audit --config
  p/secrets --error`, SARIF → code-scanning) + `npm audit --omit=dev --audit-level=high`.
- **deps** (PR-only) — `actions/dependency-review-action` with an **allow-list of permissive licenses**
  (MIT, Apache-2.0, BSD-2/3, ISC, CC-BY-4.0, 0BSD, Unlicense) — auto-enforces the MIT/permissive charter
  and blocks vulnerable deps on every PR.

### `.github/workflows/scorecard.yml` — weekly cron + push to `main`
OpenSSF `scorecard-action` → SARIF upload + `security-events: write`; produces the Scorecard badge.

### `.github/workflows/release.yml` — Changesets
`changesets/action` opens/updates a "Version Packages" PR from accumulated changesets; on merge to `main`
it *would* publish with `npm publish --provenance --access public` (`id-token: write` for OIDC
provenance) — **inert** while `private: true` / no `NPM_TOKEN`. Guard comment documents the two flips.

### `.github/dependabot.yml`
Weekly updates for `npm` and `github-actions` ecosystems; grouped minor/patch.

## Config files (terse)

- `eslint.config.js` — flat config: `@eslint/js` recommended for `.js/.mjs`; `typescript-eslint` for
  `.ts/.tsx`; browser+node globals; `no-empty: [error,{allowEmptyCatch:true}]`; `no-unused-vars` with
  `argsIgnorePattern:"^_"`. Ignores `node_modules`, `demo/**`, `model/**`, `**/dist/**`.
- `.prettierrc.json` — `{ "printWidth": 120 }` (double-quotes + semis already match defaults).
- `.prettierignore` — `node_modules`, `package-lock.json`, `model/`, `demo/chat/node_modules`,
  `demo/chat/dist`, `**/*.png`, `LICENSE`, `*.md`, `docs/`, `SPEC.md`.
- `tsconfig.json` — `noEmit`, `jsx: react-jsx`, `moduleResolution: bundler`, `module: esnext`,
  `target: es2020`, `skipLibCheck`, `allowJs: false`; `include` react + `reference/*.d.ts`.
- `.editorconfig` — UTF-8, LF, final newline, 2-space (match repo).
- `.changeset/config.json` — base branch `main`, `access: public`, changelog via
  `@changesets/changelog-github`.
- `size-limit` config in `package.json` (targets the core `reference/validate.mjs` + `react` entry).

## Community health files

`.github/SECURITY.md` (vuln-reporting policy), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor
Covenant), `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/{bug_report.yml,
feature_request.yml, config.yml}`, `.github/CODEOWNERS`.

## `package.json` changes

- Scripts: `lint`, `lint:fix`, `format`, `format:check`, `typecheck`, `coverage`, `size`,
  `attw`/`publint` (or a combined `check:package`), `changeset`, `version`, `release`.
- Add `engines.node: ">=18"`, `repository`, `bugs`, `homepage`, `size-limit`.
- devDependencies (all MIT unless noted): `eslint`, `@eslint/js`, `globals`, `typescript-eslint`,
  `prettier`, `publint`, `@arethetypeswrong/cli`, `size-limit` + `@size-limit/file`, `c8`,
  `@changesets/cli`, `@changesets/changelog-github`, `@vitest/coverage-v8`.
- Keep `private: true`.

## README + LICENSES

- One compact badge row under the hero: **CI · npm version · OpenSSF Scorecard · bundle size ·
  provenance · MIT-clean (license allowlist)** — each links to live proof.
- A short "Quality & trust" line pointing at the workflows and `SECURITY.md`.
- `LICENSES.md`: append a "Dev / CI tooling" note (all MIT/permissive; Semgrep LGPL tool-use; none
  shipped in `files`).

## One-time reformat

Run `prettier --write` across code (not docs) as a single dedicated commit, then `npm test` to confirm
green — formatting is semantics-preserving.

## Verification (local, since CI can't run locally)

Each tool run locally before commit: `npm run lint`, `npm run format:check`, `npm run typecheck`,
`npx publint`, `npx @arethetypeswrong/cli --pack`, `npm run size`, `npm audit`, `npm test`. Workflow YAML
sanity-checked. CI-runtime proof (matrix, Scorecard, Semgrep upload) lands on first push.

## Non-goals

- CodeQL (proprietary). Paid Semgrep/Snyk/Socket dashboards. Auto-publishing. Monorepo/changeset
  multi-package flows (single package). Typedoc API site (possible later; not in this pass).
