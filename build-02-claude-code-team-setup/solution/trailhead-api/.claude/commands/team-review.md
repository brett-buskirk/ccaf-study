---
description: Run the team review checklist on a file, or on the working diff
argument-hint: [file, or blank for the working diff]
---
Review $ARGUMENTS against the team checklist. If no target was given, review the output of `git diff`.

Checklist:
1. Currency is formatted only through src/lib/money.ts
2. Inputs are validated before data access
3. Every throw has a test
4. No default exports

Report each violation as: file:line, checklist item, one-line fix. If there are none, say so in one line.
