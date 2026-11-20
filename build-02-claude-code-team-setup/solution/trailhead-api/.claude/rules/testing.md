---
paths:
  - "**/*.test.ts"
---
# Testing conventions
- Use `node:test` and `node:assert/strict`. No other test libraries.
- One behavior per test. Name tests as plain statements: "formats whole dollars".
- Every function that throws gets a test for the throw.
