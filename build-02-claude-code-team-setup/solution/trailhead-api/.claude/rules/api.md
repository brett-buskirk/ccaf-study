---
paths:
  - "src/api/**/*.ts"
---
# API conventions
- Validate inputs before touching data.
- A missing record throws `Error("<thing> not found")`.
