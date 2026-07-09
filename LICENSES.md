# Third-party licenses, deterministic detectors

All runtime detector dependencies are MIT or otherwise permissive (no GPL/AGPL/CC-BY-NC/OpenRAIL).
Verified against each package's own `package.json` / license file at install time.

| Dependency | Version | License | Used by | Notes |
|---|---|---|---|---|
| validator | ^13.15.35 | MIT | `detectors/validator.mjs` | EMAIL/URL/CREDITCARD validation |
| google-libphonenumber | ^3.2.44 | MIT AND Apache-2.0 | `detectors/phone.mjs` | phone parse/validate; both terms permissive |
| ipaddr.js | ^2.4.0 | MIT | `detectors/ipaddr.mjs` | IPv4/IPv6 validate + classify |
| obscenity | ^0.4.6 | MIT | `detectors/profanity.mjs` | substitution-aware English profanity |
| leo-profanity | ^1.9.0 | MIT | `detectors/profanity.mjs` | secondary English word list |
| naughty-words | ^1.2.0 | CC-BY-4.0 | `detectors/wordlists.mjs` | multilingual lists, **attribution required** (this file) |
| unhomoglyph | ^1.0.6 | MIT | `normalize.mjs` | confusable to ASCII skeleton |

**Attribution (CC-BY-4.0):** multilingual word lists are derived from the `naughty-words` package,
which packages the "List of Dirty, Naughty, Obscene, and Otherwise Bad Words" (CC-BY-4.0).

Presidio-style regexes in `detectors/presidio.mjs` are original patterns inspired by Microsoft Presidio
(MIT); no Presidio code is vendored.

## Dev / CI tooling (not shipped)

These are `devDependencies` / CI tools only, none are in the package `files`, so they never reach a
consumer. Listed for transparency; all are permissive:

- ESLint, Prettier, typescript-eslint, eslint-plugin-react-hooks, globals, TypeScript, **MIT**.
- publint, @arethetypeswrong/cli, size-limit, c8, @changesets/cli, @vitest/coverage-v8, vitest,
  @testing-library/\* , jsdom, **MIT / ISC**.
- **Semgrep** (SAST, run in CI only), CLI is **LGPL-2.1**; used as an external tool, never linked into
  or distributed with the package. Rulesets used are the free/OSS `p/*` registry packs.
- GitHub Actions used in CI (checkout, setup-node/python, dependency-review, ossf/scorecard,
  changesets/action, upload-artifact, codeql-action/upload-sarif), **MIT/Apache-2.0**. No CodeQL
  *analysis* is run (SARIF upload only); the SAST slot is Semgrep OSS.

