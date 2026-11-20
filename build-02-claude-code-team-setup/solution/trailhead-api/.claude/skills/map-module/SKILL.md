---
name: map-module
description: Map a directory's files, exports, and import relationships. Use when exploring unfamiliar code before changing it.
argument-hint: [directory]
context: fork
agent: Explore
allowed-tools: Read, Grep, Glob
---
Map the module at $ARGUMENTS.

1. Glob for its source files.
2. For each file, list the exported names.
3. For each export, Grep the repo for files that import it.

Return under 200 words: the files with their exports, who imports what, and anything that breaks docs/architecture.md. Do not include raw search output.
