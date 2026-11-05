# Altered Arena

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) for every commit message and
every PR title (PRs are squash-merged with the PR title as the commit message):

- `feat: ...` a new feature (minor version)
- `fix: ...` a bug fix (patch version)
- `feat!: ...` or a `BREAKING CHANGE:` footer for an incompatible change
- `perf:`, `refactor:`, `docs:`, `test:`, `ci:`, `chore:` for the rest (no release)

release-please reads these messages on `main` to build the release PR (version and
`CHANGELOG.md`); a commit without this format is left out of the version and the changelog.
Merging the release PR deploys the version to the VPS (`.github/workflows/release.yml`).
