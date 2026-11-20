#!/usr/bin/env bash
set -euo pipefail

git diff "$BASE...$HEAD" > pr.diff

# 1. Prior findings: inline comments this job already posted on the PR.
gh api "repos/$GITHUB_REPOSITORY/pulls/$PR/comments" \
  --jq '[.[] | select(.body | startswith("**Claude review**")) | {path, line, body}]' \
  > prior.json

# 2. Build the prompt: fixed criteria plus what was already reported.
{
  cat .github/review-prompt.md
  echo
  echo "## Previously reported findings"
  cat prior.json
} > prompt.txt

# 3. Run Claude Code non-interactively with a schema.
claude -p "$(cat prompt.txt)" \
  --output-format json \
  --json-schema "$(cat .github/review-schema.json)" \
  --allowedTools "Read,Grep,Glob" \
  < pr.diff > out.json

# 4. Post each finding as an inline comment.
jq -c '.structured_output.findings[]' out.json | while read -r f; do
  body=$(jq -r '"**Claude review** (\(.severity), \(.category))\n\n\(.issue)\n\nSuggested fix: \(.suggested_fix)\n\n<!-- pattern: \(.detected_pattern) -->"' <<<"$f")
  gh api "repos/$GITHUB_REPOSITORY/pulls/$PR/comments" \
    -f commit_id="$HEAD" \
    -f path="$(jq -r .file <<<"$f")" \
    -F line="$(jq -r .line <<<"$f")" \
    -f side=RIGHT \
    -f body="$body" \
    || echo "Could not post an inline comment for: $f"
done
