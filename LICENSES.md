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
