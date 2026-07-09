# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). To record a
user-facing change, run `npm run changeset` and follow the prompts, it writes a markdown file here
describing the change and the semver bump. The `release` workflow consumes these to produce a version
PR and `CHANGELOG.md`.
