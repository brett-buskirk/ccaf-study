# Architecture
- `src/api/` holds request-level functions. It may import from `src/lib/`.
- `src/lib/` holds pure helpers. It must never import from `src/api/`.
- `terraform/` holds infrastructure for the API host.
