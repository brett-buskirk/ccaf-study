# Build 2 solution

The finished configuration for [Build 2](../README.md). Try the build yourself first; this is here for when you're stuck or want to compare.

Build 2 has you create a separate repository called `trailhead-api`. The `trailhead-api/` folder here is a snapshot of that repo's `main` branch at the end of Step 6d, before the Step 5 exercises change any source code. It is a reference copy, not a working repo: its `.github/` and `.claude/` folders do nothing while nested inside this one.

| Path | What it is | Step |
| --- | --- | --- |
| `trailhead-api/src/`, `terraform/main.tf`, `package.json` | The scratch project | Setup |
| `trailhead-api/CLAUDE.md`, `docs/architecture.md` | Project instructions and the imported architecture file | 1 |
| `trailhead-api/terraform/CLAUDE.md` | Directory-level instructions | 1 |
| `trailhead-api/.claude/rules/` | One unscoped rule and two path-scoped rules, canary lines removed | 2 |
| `trailhead-api/.claude/commands/team-review.md` | The project slash command | 3 |
| `trailhead-api/.claude/skills/map-module/SKILL.md` | The forked exploration skill | 3 |
| `trailhead-api/.mcp.json` | The shared MCP server, with the token as a variable | 4 |
| `trailhead-api/.github/` | Review prompt, output schema, script, and workflow | 6 |
| `home-directory/.claude/CLAUDE.md` | The one line that goes in your own `~/.claude/CLAUDE.md` | 1 |
| `risky-change/append-to-orders.ts` | The planted problems for the `risky-change` branch | 6 |

## Use it

Copy `trailhead-api/` somewhere outside this repo, then:

```bash
cd trailhead-api
npm install && npm test      # expect: pass 2, fail 0
git init -b main && git add -A && git commit -m "Scaffold trailhead-api"
```

From there, pick up the guide at whichever step you want to check.

## Not included

- The personal `my-map` skill and the user-scope MCP server, which live in your home directory.
- The results of Step 5, where Claude Code edits the source for you. Those differ on every run.

## Tested

`npm test` passes, the review script passes a shell syntax check, and the workflow, schema, and `.mcp.json` parse. Nothing was run against the live API, GitHub Actions, or the GitHub MCP endpoint.
