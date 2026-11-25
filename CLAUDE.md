# CLAUDE.md — ccaf-study

Operating conventions for the agent working in **ccaf-study**: hands-on practice builds for the Claude
Certified Architect – Foundations exam. Content-first repo — markdown build guides; no finished
solutions are checked in. Read this before committing anything or opening an issue or PR.

## Where this repo sits
This repo lives at `~/ccaf-study`, **outside** Brett's estate root (`~/github-repos`) on purpose — so the
estate tooling (`huginn` / `geri` / `freki` / …) does **not** manage or sweep it. The GitHub conventions
below therefore aren't applied for you automatically; **you follow them by hand.** (The machine-wide
managed policy at `/etc/claude-code/CLAUDE.md` still governs the universal safety, review, and governance
floors.)

## Git & GitHub conventions
- **Never commit directly to `main`.** `main` is a protected branch: pull requests are required,
  force-pushes and deletion are blocked, and commits reaching it must be **signed**. So: work on a
  branch → open a PR → **stop and let Brett merge.** Never self-merge.
- **Branch names:** `feat/…`, `fix/…`, `docs/…`, `chore/…`, `ci/…`.
- **Signed commits.** Commits here are SSH-signed and show **Verified** — keep it that way. End every
  agent-authored commit message with a `Co-Authored-By: <model name> <noreply@anthropic.com>` trailer
  naming the model that **actually** did the work (never copy a hardcoded name). If you commit from a
  shell that can't sign, that's fine — Brett **squash-merges** the PR and GitHub signs the squash
  commit, which satisfies the signing rule.
- **Small, reviewable PRs** — one focused change each. Where a build has runnable code, ship its
  check/validation in the same PR.
- **Wire every issue and PR completely on creation** (don't ship it bare):
  - **Assignee** → `--assignee brett-buskirk`.
  - **Label** → a fitting one from the taxonomy below.
  - **Milestone** → if/when the repo starts using them.
  - This repo is **standalone** — it is *not* wired into the estate's Linear or project boards.

## Labels
Base set (already applied to the repo): `needs-triage` · `approved` · `chore` · `ci` · `dependencies` ·
`security` · `release` · `breaking`. GitHub's defaults (`bug`, `documentation`, `enhancement`, …) stay
too. Add a new label deliberately and with a description — don't invent one-offs.

## Secrets (this repo uses live API keys)
The builds call the Claude API with a key. **Never commit a key or a `.env` file** — read it from the
environment, the way the build guides do. Secret scanning + push protection are **on** for this public
repo, so a pushed secret will be blocked; don't rely on that as the control, keep keys out of the diff
entirely. (Dependencies, virtualenvs, and build output are already covered by `.gitignore`.)

## When in doubt
Branch → PR → hand it to Brett. He owns the merge and the final call.
