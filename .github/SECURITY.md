# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately via GitHub's [private vulnerability reporting](https://github.com/Lowdown-Labs/fela_moderator/security/advisories/new)
(Security → Report a vulnerability), or email **security@lowdownlabs.com**.

We aim to acknowledge reports within **3 business days** and to ship a fix or mitigation for confirmed,
high-severity issues within **30 days**. We'll credit reporters who wish to be named.

## Scope

This SDK runs **entirely on-device** — no user text leaves the device on the core path, and detectors
perform no network I/O. The most relevant classes of report are therefore:

- A detector or the normalizer mishandling input in a way that causes a crash, hang (ReDoS), or a
  wildly wrong span/redaction (PII exposure through a missed or mis-placed redaction).
- A dependency vulnerability that reaches the shipped runtime surface (see `LICENSES.md` for the
  vetted dependency set).
- Any code path that unexpectedly performs network I/O (this would violate the SDK's core invariant).

## Supported versions

The latest published minor version receives security fixes.
