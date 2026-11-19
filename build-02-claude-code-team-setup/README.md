# Build 2: Claude Code Team Setup and CI Review — Step-by-Step

[Back to the study guide](../README.md) · Last revised Nov 15, 2026

## What you're building

You're configuring a repository so that Claude Code behaves the same for every developer who clones it, then wiring Claude Code into CI as a pull request reviewer. Plan on 2 to 3 hours.

Build 1 was about writing an agent. This build is about configuring one that already exists. The skill being tested is knowing which file a given instruction belongs in, and why.

Think of it as the difference between `/etc` and a dotfile in your home directory. Some configuration ships with the repo and applies to everyone. Some lives on your machine and applies only to you. Most exam questions in this domain come down to someone putting a thing in the wrong one.

### Three ideas to hold before you start

1. **Scope decides who gets it.** Anything under the repo (`CLAUDE.md`, `.claude/`, `.mcp.json`) is shared through git. Anything under your home directory (`~/.claude/`, `~/.claude.json`) is yours alone.
2. **Always-loaded versus on-demand.** `CLAUDE.md` is read into every session. Path-scoped rules load when matching files are touched. Skills and commands load when invoked. Everything always-loaded costs context on every request, so the question is always "does this need to be in the room for every conversation?"
3. **Automatic versus hoped-for.** A glob pattern that matches a file path is deterministic. "Claude will figure out which section applies" is not. When a question says a convention must apply automatically, pick the mechanism that matches on paths.

### What each step maps to on the exam

| Step | You build | Exam task statements |
| --- | --- | --- |
| 1 | `CLAUDE.md` at three levels, with imports | 3.1 |
| 2 | Path-scoped rules | 3.3 |
| 3 | A slash command and a skill | 3.2 |
| 4 | Shared and personal MCP servers | 2.4 |
| 5 | Plan mode, direct execution, refinement | 3.4, 3.5 |
| 6 | A CI review job with structured output | 3.6, 4.1, 4.6 |
| 7 | Deliberate breakage | Sample questions 4–6, 10–12 |

## Setup

You need Claude Code installed and signed in, Node 20 or newer, `git`, the `gh` CLI, and `jq`. Step 6 also needs a GitHub repo you can push to and an API key stored as a repo secret.

You'll work in a small scratch repo so each step has something predictable to act on. It has API code, colocated tests, and a Terraform folder, because the exam's examples use exactly those three.

```bash
mkdir trailhead-api && cd trailhead-api
git init -b main
npm init -y
npm pkg set type=module scripts.test='tsx --test "src/**/*.test.ts"'
npm install -D tsx typescript @types/node
mkdir -p src/api src/lib terraform docs .github/workflows
printf 'node_modules\n' > .gitignore
```

Create these five files.

`src/lib/money.ts`

```ts
export function formatMoney(amount: number): string {
  return "$" + amount.toFixed(2);
}
```

`src/lib/money.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "./money.js";

test("formats whole dollars", () => {
  assert.equal(formatMoney(48), "$48.00");
});
```

`src/api/orders.ts`

```ts
import { formatMoney } from "../lib/money.js";

export type Order = { id: string; total: number; delivered: boolean };

const orders: Order[] = [
  { id: "ORD-5001", total: 48, delivered: true },
  { id: "ORD-5003", total: 89.5, delivered: false },
];

export function getOrder(id: string): Order | undefined {
  return orders.find((o) => o.id === id);
}

export function refundSummary(id: string): string {
  const order = getOrder(id);
  if (!order) throw new Error("order not found");
  return `Refund ${formatMoney(order.total)} for ${order.id}`;
}
```

`src/api/orders.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { refundSummary } from "./orders.js";

test("summarizes a refund", () => {
  assert.equal(refundSummary("ORD-5001"), "Refund $48.00 for ORD-5001");
});
```

`terraform/main.tf` (never applied; it only needs to exist)

```hcl
resource "digitalocean_droplet" "api" {
  name   = "trailhead-api"
  region = "nyc3"
  size   = "s-1vcpu-1gb"
  image  = "ubuntu-24-04-x64"
}
```

Check it works, then commit:

```bash
npm test          # expect: pass 2, fail 0
git add -A && git commit -m "Scaffold trailhead-api"
```

Note that the two test files sit next to the code they test, in different directories. That layout is what makes Step 2 interesting.

## Step 1: The CLAUDE.md hierarchy

`CLAUDE.md` is a plain Markdown file of instructions that Claude Code reads at the start of every session. It exists at three levels, and the level decides who receives it.

### 1a. Project level (shared)

Create `CLAUDE.md` in the repo root:

```md
# trailhead-api

Order and refund API for an outdoor gear store. TypeScript, ES modules, Node 22.

## Commands
- Run tests: `npm test`

## Standards (apply everywhere)
- Format currency only through `src/lib/money.ts`. Never format it inline.
- Throw `Error` with a lowercase message. Never return error strings.
- No default exports.

## Architecture
@docs/architecture.md
```

Create `docs/architecture.md`, which that last line imports:

```md
# Architecture
- `src/api/` holds request-level functions. It may import from `src/lib/`.
- `src/lib/` holds pure helpers. It must never import from `src/api/`.
- `terraform/` holds infrastructure for the API host.
```

### 1b. User level (yours only)

Open `~/.claude/CLAUDE.md`, creating it if needed, and add one personal line:

```md
- When you explain a concept to me, use an infrastructure analogy.
```

### 1c. Directory level (shared, narrow)

Create `terraform/CLAUDE.md`:

```md
# Terraform conventions
- Every resource sets `tags` and includes "managed-by-terraform".
- Pin provider versions in `versions.tf`.
```

### 1d. Verify

Start `claude` in the repo root and run these in order:

1. `/memory`. It lists the instruction files in play. Expect your user file and the project file.
2. Ask: `Without reading any files, what are this project's rules about money, and what may src/lib import?` The second half can only come from the imported architecture file.
3. Ask: `Read terraform/main.tf and tell me which of our conventions it breaks.` Expect the missing `tags`. That rule lives only in `terraform/CLAUDE.md`.
4. Exit and run `git status --short`. The project files show up. Your user-level file does not, because it isn't in the repo.

Commit the project files.

### What to notice, and why

| File | Applies to | Shared through git | Loaded |
| --- | --- | --- | --- |
| `~/.claude/CLAUDE.md` | You, in every project | No | Every session |
| `./CLAUDE.md` or `./.claude/CLAUDE.md` | Everyone on this project | Yes | Every session |
| `<subdir>/CLAUDE.md` | Work inside that directory | Yes | When Claude works with files there |

- **The classic exam scenario.** "A new teammate isn't getting the team's instructions." The instructions are in someone's user-level file. Step 4 of the verification is the tell: if `git status` can't see it, neither can your teammates. The fix is to move it to the project level.
- **`@import` keeps the main file short.** The path resolves relative to the file doing the importing, and imports can nest a few levels deep. Use it to pull in standards that already live elsewhere in the repo.
- **`/memory` is the diagnostic.** When behavior differs between sessions or between people, check what loaded before you rewrite any instructions.
- **Everything here is always-on.** Each line in a project `CLAUDE.md` is paid for on every request. Keep universal standards here and move anything situational to rules or skills, which is the next two steps.

## Step 2: Path-scoped rules

A rule is a Markdown file in `.claude/rules/`. Give it a `paths` list of glob patterns and it loads only when Claude works with a matching file. This is how you attach conventions to a kind of file instead of a directory.

Your tests live in two directories. A `CLAUDE.md` in each would mean two copies to keep in sync, and a third the day someone adds `src/jobs/`. One rule with a glob covers all of them.

```bash
mkdir -p .claude/rules
```

### 2a. A rule for every test file, wherever it lives

`.claude/rules/testing.md`

```md
---
paths:
  - "**/*.test.ts"
---
# Testing conventions
- Use `node:test` and `node:assert/strict`. No other test libraries.
- One behavior per test. Name tests as plain statements: "formats whole dollars".
- Every function that throws gets a test for the throw.
- Canary: if asked which rule canaries you can see, include TESTING-RULE.
```

### 2b. A rule for API code

`.claude/rules/api.md`

```md
---
paths:
  - "src/api/**/*.ts"
---
# API conventions
- Validate inputs before touching data.
- A missing record throws `Error("<thing> not found")`.
- Canary: if asked which rule canaries you can see, include API-RULE.
```

### 2c. A rule with no paths

`.claude/rules/git.md`

```md
# Git conventions
- Commit subjects are imperative and under 60 characters.
- Canary: if asked which rule canaries you can see, include GIT-RULE.
```

### 2d. Verify

The canary lines exist so you can see loading happen. Start a fresh `claude` session:

1. Ask: `Which rule canaries can you see? Don't read any files.` Expect only GIT-RULE.
2. Ask: `Read src/lib/money.test.ts.` Then ask the canary question again. Expect TESTING-RULE to have appeared.
3. Ask: `Read src/api/orders.ts.` Ask again. Expect API-RULE as well.
4. Now the payoff: `Add a test for the not-found case in src/api/orders.test.ts.` The new test should use `node:test`, a plain-statement name, and assert on the throw. You never mentioned any of that.

Remove the three canary lines, run `npm test`, and commit.

### 2e. Optional: fold the Terraform file into a rule

Move the contents of `terraform/CLAUDE.md` into `.claude/rules/terraform.md` with `paths: ["terraform/**/*"]`, and delete the original. Behavior is the same. For a single directory either mechanism works; the rule version keeps every convention in one folder.

### What to notice, and why

- **Unscoped rules load at startup; scoped rules load on a match.** `git.md` behaved like part of `CLAUDE.md`. The other two stayed out of context until a matching file was touched.
- **A file can match several rules.** `src/api/orders.test.ts` matches both the testing and API globs, so it gets both sets of conventions.
- **Matching is on file paths, by pattern.** That's why this is the "automatic" option. Nothing depends on Claude deciding a section is relevant.

Sample Question 6 offers four ways to apply per-area conventions. This step is the reasoning behind the answer:

| Option | Why it loses or wins |
| --- | --- |
| One big root `CLAUDE.md` with a section per area | Relies on Claude inferring which section applies. Always loaded. |
| A skill per code type | Skills load when invoked, so nothing is automatic. |
| A `CLAUDE.md` in each subdirectory | Bound to directories. Fails for files spread across the tree. |
| `.claude/rules/` with `paths` globs | Matches by path regardless of location. Correct. |

## Step 3: A slash command and a skill

Commands and skills are instructions that load only when invoked. A command is a single Markdown file. A skill is a folder with a `SKILL.md` and room for supporting files, plus frontmatter that controls how it runs.

### 3a. A project slash command

```bash
mkdir -p .claude/commands
```

`.claude/commands/team-review.md`

```md
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
```

Restart `claude` and run `/team-review src/api/orders.ts`. The filename becomes the command name, and `$ARGUMENTS` is replaced by whatever you type after it.

The exam's version of this is called `/review`. Claude Code ships its own review-style commands, such as `/security-review`, and the built-in list changes between versions. This build uses `/team-review` so your command can't collide with one.

### 3b. A project skill that runs in isolation

```bash
mkdir -p .claude/skills/map-module
```

`.claude/skills/map-module/SKILL.md`

```md
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
```

Verify in a fresh session:

1. Run `/context` and note the usage.
2. Type `/map-module` and pause. The hint `[directory]` appears next to it.
3. Run `/map-module src`. You get a short summary back.
4. Run `/context` again. The main conversation grew by roughly the size of the summary, not by the file reads and searches behind it.

### 3c. A personal variant

Suppose you want a chattier version for yourself. Don't edit the shared one. Copy it to your home directory under a different name:

```bash
mkdir -p ~/.claude/skills/my-map
cp .claude/skills/map-module/SKILL.md ~/.claude/skills/my-map/SKILL.md
```

Edit the copy: change `name` to `my-map` and adjust the instructions. `/my-map` is now yours, and `/map-module` is unchanged for the team.

Commit the project command and skill.

### What to notice, and why

| Location | Who gets it |
| --- | --- |
| `.claude/commands/` and `.claude/skills/` | Everyone who clones the repo |
| `~/.claude/commands/` and `~/.claude/skills/` | Only you, in every project |

- **`context: fork` is context hygiene.** The skill runs in a separate subagent with its own context window. All the file reads and search results stay there, and only the final answer comes back. Use it for anything verbose or exploratory. The trade-off: the fork doesn't see your conversation so far, so the skill's instructions must be self-contained.
- **`argument-hint`** tells the developer what to type. Without it, a skill that needs a parameter gets invoked bare and has to ask.
- **`allowed-tools`** scopes which tools the skill works with. The exam guide describes it as restricting tool access during the skill, for example to prevent destructive actions. Current docs describe it as the tools the skill may use without a permission prompt. Answer the guide's way on the exam.
- **Skill or `CLAUDE.md`?** If every session needs it, it's a `CLAUDE.md` line. If it's a procedure someone runs occasionally, it's a skill. A review checklist in `CLAUDE.md` would tax every unrelated conversation.
- **Sample Question 4** asks where a team-wide command goes. The answer is `.claude/commands/` in the repo. The distractors are the home-directory version, `CLAUDE.md`, and a config file that doesn't exist.

## Step 4: Shared and personal MCP servers

MCP servers give Claude Code extra tools, the same way your Build 1 server gave the agent `get_customer`. Here you don't write one. You configure existing servers at two scopes: one for the team, one for you.

### 4a. A shared server in `.mcp.json`

Create `.mcp.json` in the repo root:

```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}"
      }
    }
  }
}
```

The file contains the variable name, not the token. Each developer supplies their own:

```bash
export GITHUB_TOKEN="$(gh auth token)"
claude
```

Claude Code asks you to approve a project-scoped server the first time it sees one. Approve it, then run `/mcp` to confirm `github` is connected. Try: `Using the github tools, list my five most recently updated repositories.`

That URL is GitHub's hosted MCP endpoint at the time of writing, and the connection was not tested for this guide. If `/mcp` shows a failure, check the URL against GitHub's MCP server README before debugging anything else.

### 4b. A personal server at user scope

```bash
claude mcp add --scope user scratch-memory -- npx -y @modelcontextprotocol/server-memory
claude mcp list
```

`--scope user` writes the entry to `~/.claude.json`, outside the repo. `claude mcp list` should show both servers. Start `claude` and run `/mcp`: both are connected at once, and tools from both are available in the same session.

### 4c. Verify what's shared

```bash
git status --short        # .mcp.json is there; scratch-memory is nowhere in the repo
grep -c 'GITHUB_TOKEN' .mcp.json   # 1: the placeholder, never the secret
```

Commit `.mcp.json`. When you're done experimenting: `claude mcp remove scratch-memory`.

### What to notice, and why

| Scope | Stored in | Shared | Use for |
| --- | --- | --- | --- |
| project | `.mcp.json` in the repo | Yes | Tooling the whole team needs |
| user | `~/.claude.json` | No | Personal or experimental servers |

The CLI also has a third scope, `local`, which is its default: private to you and to this one project. The exam guide only discusses the two in the table.

- **`${VAR}` expansion keeps secrets out of git.** The config is committed; the credential comes from each person's environment. A token pasted into `.mcp.json` is the wrong answer on the exam and in life.
- **All connected servers are live together.** Tools are discovered when each server connects, and Claude sees the combined set. That's convenient, and it's also how an agent ends up with 40 tools. The "4 to 5 tools per agent" lesson from Build 1 applies here too.
- **Prefer an existing server for standard integrations.** For GitHub, Jira, and similar, use the maintained community or vendor server. Write a custom one only for workflows specific to your team.
- **Descriptions decide adoption.** If an MCP tool's description is thin, Claude will fall back on built-ins like Grep even when the MCP tool is more capable. The fix is a better description, same as Build 1.
- **Resources versus tools.** MCP servers can also expose resources: read-only catalogs such as issue summaries, doc trees, or database schemas. They let the agent see what exists without spending tool calls on exploration. Tools are for actions; resources are for "here's what's available."

## Step 5: Plan mode, direct execution, and refinement

In plan mode, Claude Code reads and investigates but changes nothing until you approve a written plan. Direct execution skips the plan and starts editing. The exam asks you to pick the right one for a described task, so here you run three tasks and feel the difference.

Press Shift+Tab to cycle modes until the status line shows plan mode, or start with `claude --permission-mode plan`.

### 5a. Task A: direct execution

In normal mode:

```text
In src/api/orders.ts, make refundSummary throw "order not delivered" when the order has not been delivered. Add a test.
```

One file, one obvious approach, and a test tells you whether it worked. A plan here would be ceremony. Notice the new test follows your Step 2 conventions without being told.

### 5b. Task B: plan mode for a multi-file change

Switch to plan mode:

```text
Money is stored as floating-point dollars. Change the codebase to store integer cents everywhere and convert only when formatting.
```

Read the plan before approving. Check that it names every file: the `Order` type, the sample data, `formatMoney`, and both test files. A change like this fails when one spot is missed, and the plan is where you catch that for free. Approve it and let it execute, then run `npm test`.

That sequence, plan mode for the investigation and then execution of the approved plan, is itself a pattern the exam names.

### 5c. Task C: plan mode when there are several valid approaches

Stay in plan mode:

```text
Orders are hard-coded in orders.ts. I want them persisted. Before you plan anything, interview me: ask up to five questions about constraints I haven't mentioned.
```

Answer the questions, then ask for a plan comparing two or three approaches. You don't need to implement it. The point is what the questions surface: concurrency, where the API runs, whether the Terraform needs a database. Those are decisions you'd otherwise discover halfway through the wrong implementation.

### 5d. The Explore subagent

Before a large task, discovery can flood your context with file contents. Delegate it:

```text
Use the Explore subagent to find every place a money amount is created, stored, compared, or formatted. Report back a list of file:line with one line each.
```

The searching happens in the subagent's context. You get the list. This is the same isolation idea as `context: fork` in Step 3.

### 5e. Three refinement techniques

Each is a short exercise on `formatMoney`.

1. **Examples beat prose.** Ask: `Make formatMoney handle thousands separators and negative amounts.` There are several reasonable outputs. Now ask again with examples: `123450 cents -> "$1,234.50"; -500 -> "-$5.00"; 0 -> "$0.00"`. Two or three input/output pairs remove the ambiguity that a paragraph leaves in.
2. **Tests first.** Write the failing tests yourself in `money.test.ts`, run `npm test`, then paste the failures with: `Make these pass without changing the tests.` The test output is precise feedback, and Claude iterates against it.
3. **Batch what interacts.** If two fixes affect each other, such as the cents migration and the formatter change, describe both in one message. If they're independent, send them one at a time so each can be checked alone.

### What to notice, and why

| Signal in the task | Mode |
| --- | --- |
| Single file, clear scope, obvious fix (a stack trace, one validation check) | Direct |
| Many files, or order of changes matters | Plan |
| Architectural decision, or several valid approaches | Plan |
| Unfamiliar code you need to understand first | Plan, with Explore for discovery |

- **Plan mode is cheap insurance against rework.** Exploring costs little. Undoing a half-finished migration built on a wrong assumption costs a lot.
- **Complexity stated up front means plan up front.** Sample Question 5 describes a monolith-to-microservices restructure. "Start direct and switch to plan mode if it gets complicated" is a distractor, because the question already told you it's complicated.
- **The interview pattern is for unfamiliar territory.** Having Claude ask questions first surfaces considerations you didn't know to specify.
- **Explore protects the main context.** Verbose discovery in the main session is how long tasks run out of room before the real work starts.

## Step 6: Claude Code as a CI reviewer

In CI there is no human at the keyboard, so Claude Code must run non-interactively and return output a script can parse. Three flags do that: `-p` runs one prompt and exits, `--output-format json` wraps the result in JSON, and `--json-schema` forces the answer into a shape you define.

You'll build it on `main`, dry-run it locally, then let GitHub Actions run it on a pull request.

### 6a. The review criteria

`.github/review-prompt.md`

```md
You are reviewing a pull request. The diff is on standard input. You may read other files in the repo for context.

## Report only these
- bug: code that produces a wrong result, throws unexpectedly, or breaks an existing caller.
- security: injection, missing authorization, secrets in code, unsafe handling of user input.

## Do not report
- Formatting, naming, or style preferences.
- Missing comments or documentation.
- Code that matches the pattern the surrounding file already uses.
- Anything on a line this diff did not add or change.

## Severity
- critical: exploitable or data-destroying. Example: a query built by concatenating user input.
- high: wrong behavior on a normal path. Example: a refund computed from the wrong field.
- medium: wrong behavior on an edge case. Example: a crash when a lookup returns nothing.

## Examples
Diff line: const q = "SELECT * FROM t WHERE id = '" + id + "'";
Finding: security, critical, detected_pattern "string-concatenated SQL".

Diff line: let order = getOrder(id);
Finding: none. let versus const is style.

Diff line: a loop written the same way as three other loops in the same file.
Finding: none. It matches the local pattern and is not a defect.

## Output
For each finding give: the file path, the line number in the new version of the file, severity, category, detected_pattern (a short name for the code construct that triggered it), the issue in one or two sentences, and a concrete suggested fix.
Use category "other" with a category_detail only for a real defect that fits neither category. Otherwise category_detail is null.
If nothing qualifies, return an empty findings list.

A list of previously reported findings may follow. Do not repeat any finding already on that list.
```

### 6b. The output schema

`.github/review-schema.json`

```json
{
  "type": "object",
  "properties": {
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "file": { "type": "string" },
          "line": { "type": "integer" },
          "severity": { "type": "string", "enum": ["critical", "high", "medium"] },
          "category": { "type": "string", "enum": ["bug", "security", "other"] },
          "category_detail": { "type": ["string", "null"] },
          "detected_pattern": { "type": "string" },
          "issue": { "type": "string" },
          "suggested_fix": { "type": "string" }
        },
        "required": ["file", "line", "severity", "category", "category_detail", "detected_pattern", "issue", "suggested_fix"]
      }
    }
  },
  "required": ["findings"]
}
```

### 6c. The script

`.github/review.sh`

```bash
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
```

### 6d. The workflow

`.github/workflows/claude-review.yml`

```yaml
name: Claude review
on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install -g @anthropic-ai/claude-code
      - name: Review the diff
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ github.token }}
          PR: ${{ github.event.pull_request.number }}
          BASE: ${{ github.event.pull_request.base.sha }}
          HEAD: ${{ github.event.pull_request.head.sha }}
        run: bash .github/review.sh
```

Commit all four files to `main`, and ignore the scratch files:

```bash
printf 'pr.diff\nprior.json\nprompt.txt\nout.json\n' >> .gitignore
git add -A && git commit -m "Add Claude review job"
```

### 6e. A branch with planted problems

```bash
git checkout -b risky-change
```

Append to `src/api/orders.ts`:

```ts
export function findOrdersSql(customerName: string): string {
  let query = "SELECT * FROM orders WHERE customer = '" + customerName + "'";
  return query;
}

export function refundAmount(id: string, percent: number): number {
  const order = getOrder(id);
  return order!.total * percent;
}
```

Commit it. There are three things in there: a SQL injection, a crash when the order doesn't exist, and a `let` that could be `const`. A good reviewer reports the first two and stays quiet about the third.

### 6f. Dry run on your machine

```bash
git diff main...risky-change > pr.diff
claude -p "$(cat .github/review-prompt.md)" \
  --output-format json \
  --json-schema "$(cat .github/review-schema.json)" \
  --allowedTools "Read,Grep,Glob" \
  < pr.diff | tee out.json | jq '.structured_output'
```

Expect a `findings` array with the injection and the missing-order crash, and nothing about `let`. Then look at the envelope around it with `jq 'del(.structured_output)' out.json`: session ID, cost, and the plain-text `result`.

### 6g. Run it on a real pull request

```bash
gh repo create trailhead-api --private --source=. --remote=origin
git push -u origin main
gh secret set ANTHROPIC_API_KEY        # paste your key when prompted
git push -u origin risky-change
gh pr create --fill --base main
gh run watch
```

Open the PR. The findings appear as inline comments on the offending lines.

### 6h. Push again and check for duplicates

Fix the SQL injection only, add one new bug of your own, commit, and push. The job re-runs. It should comment on your new bug and stay silent about the crash it already flagged.

### What to notice, and why

- **`-p` is what stops CI from hanging.** Without it, Claude Code waits for interactive input that never comes. Sample Question 10 is exactly this, and the distractors are flags and environment variables that don't exist.
- **`CLAUDE.md` is how CI gets project context.** The job checks out the repo, so your Step 1 and Step 2 files load in CI too. Don't add `--bare` here: it skips `CLAUDE.md` discovery for a faster start.
- **The structured answer is in `structured_output`.** With `--json-schema`, that field holds the validated object. `result` still holds free text.
- **A schema guarantees shape, not truth.** Every finding will have an integer `line`. Nothing guarantees it's the right line. When it's wrong, GitHub rejects the comment, which is why the script has a fallback.
- **Explicit categories beat "be conservative."** The prompt names what to report and what to skip, with examples of each. Vague instructions such as "only report high-confidence issues" don't reduce false positives. Named criteria do (task 4.1).
- **False positives cost more than they look.** Developers who see three style nitpicks stop reading the fourth comment, which is the real bug. If one category is noisy, turn it off while you fix its prompt.
- **`detected_pattern` is for you, not the developer.** It records which code construct triggered each finding. When developers dismiss findings, you can group dismissals by pattern and see which criteria need work (task 4.4).
- **The reviewer didn't write the code.** A session that wrote code carries the reasoning that led to it and is unlikely to question it. A fresh instance has no such attachment. That's why review belongs in a separate run, and CI gives you that for free (task 4.6).
- **`--allowedTools "Read,Grep,Glob"` makes it read-only.** Nobody is present to approve a prompt, and a reviewer has no reason to edit.
- **Feeding back prior findings prevents duplicates.** Each run is a new session with no memory of the last. Anything it should know about earlier runs has to be in the prompt.
- **This job is blocking, so it uses the normal API.** The Message Batches API is half the cost but can take up to 24 hours. That suits a nightly tech-debt report, not a check a developer is waiting on (Sample Question 11).

### Stretch: multi-pass review

On a 14-file PR, one pass gives uneven depth and contradictory feedback. Change the script to loop over changed files and review each alone, then run one final pass over the whole diff that looks only at cross-file issues. That's the answer to Sample Question 12. A larger context window is the distractor: the problem is attention, not capacity.

## Step 7: Break it on purpose

Each experiment reproduces a failure the exam describes. Undo each one before the next.

### Experiment 1: The teammate who gets no instructions (task 3.1)

Cut the "No default exports" line from the project `CLAUDE.md` and paste it into `~/.claude/CLAUDE.md`. In your own session, nothing changes: ask about default exports and Claude still knows the rule.

Now become a teammate. A teammate is just a different home directory:

```bash
HOME="$(mktemp -d)" ANTHROPIC_API_KEY="sk-ant-..." \
  claude -p "Does this project have a rule about default exports? Answer from your instructions only."
```

The rule is gone. This is the exact shape of the exam scenario: it works for the author and for nobody else.

### Experiment 2: Directory files for a cross-cutting convention (Sample Question 6)

Delete `.claude/rules/testing.md` and put the same conventions in `src/api/CLAUDE.md`. Ask Claude to add a test to `src/lib/money.test.ts`. The conventions don't apply, because that file isn't under `src/api/`. You'd need a copy per directory, forever.

### Experiment 3: Vague review criteria (task 4.1)

In `review-prompt.md`, replace the "Report only these" and "Do not report" sections with one line: `Be conservative. Only report high-confidence issues.` Run the 6f dry run three times.

Watch for the `let` nitpick appearing, and for findings that differ between runs. "Be conservative" doesn't say what to be conservative about.

### Experiment 4: Forget `-p` (Sample Question 10)

On a throwaway branch, remove `-p` from `review.sh` and add `timeout-minutes: 3` under the `review:` job so it can't burn your Actions minutes. Open a PR. The job sits until the timeout kills it.

### Experiment 5: Self-review versus a fresh reviewer (task 4.6)

In an interactive session, ask Claude to write `applyDiscount(orderId, code)` with a few rules you make up. In the same session, ask it to review what it just wrote. Then exit, and run a fresh `claude -p` review of the same diff using your review prompt.

Compare the two. Results vary by run, but the fresh instance is the one with no stake in the earlier reasoning.

### Experiment 6: Drop the fork (task 3.2)

Remove `context: fork` and `agent: Explore` from `map-module`. Run `/context`, then `/map-module src`, then `/context` again. Every file read now lands in your main conversation.

## Checklist and exam mapping

- [ ] I can name the three `CLAUDE.md` levels and say which are shared through git (3.1)
- [ ] I can diagnose "my teammate doesn't get the instructions" (3.1)
- [ ] I used `@import` and can say what it's for (3.1)
- [ ] I used `/memory` to see what loaded (3.1)
- [ ] I wrote a rule with a `paths` glob and watched it load on a match (3.3)
- [ ] I can explain why globs beat per-directory files for scattered test files (3.3)
- [ ] I know where a team command goes and where a personal one goes (3.2)
- [ ] I can explain `context: fork`, `allowed-tools`, and `argument-hint` (3.2)
- [ ] I can say when something is a skill and when it's a `CLAUDE.md` line (3.2)
- [ ] I configured a shared server in `.mcp.json` with `${VAR}` expansion (2.4)
- [ ] I configured a personal server at user scope (2.4)
- [ ] I can choose plan mode or direct execution from a task description (3.4)
- [ ] I used input/output examples, tests-first, and the interview pattern (3.5)
- [ ] I ran `claude -p` with `--output-format json` and `--json-schema` (3.6)
- [ ] My review prompt names what to report and what to skip (4.1)
- [ ] My CI re-run avoids duplicate comments (3.6)
- [ ] I can explain why the reviewer should be a separate instance (4.6)
- [ ] I ran the six experiments in Step 7

### Where the guide and current tooling differ

The exam guide is version 0.1 from February 2025. Answer the guide's way on the exam.

| Topic | Exam guide says | Current tooling |
| --- | --- | --- |
| Skill `allowed-tools` | Restricts tool access during the skill | Described as tools usable without a permission prompt |
| Commands and skills | Two separate things in two folders | Skills are also invoked as `/name`; both folders work |
| MCP scopes | Project and user | `local` (the CLI default), `project`, and `user` |

### How far this was tested

- The scratch repo was scaffolded and `npm test` passed.
- The CI script passed a shell syntax check, the workflow and schema parsed, and the `jq` steps were run against sample output.
- The CLI flags and `claude mcp` options were read from `claude --help` on Claude Code 2.1.325, including what `--bare` skips.
- Nothing was run against the live API or GitHub. The described Claude behavior and the GitHub MCP URL are expected, not observed.

### Sources

- [Run Claude Code programmatically](https://code.claude.com/docs/en/headless): `-p`, `--output-format`, `--json-schema`, and the `structured_output` field (read as search excerpts, not the full page)
- [Claude Code memory](https://code.claude.com/docs/en/memory) and [skills](https://code.claude.com/docs/en/skills): the official pages for Steps 1 to 3. They were not read directly for this guide; rule and frontmatter details were cross-checked against several write-ups that quote them
- `claude --help` and `claude mcp add --help`, Claude Code 2.1.325
- Claude Certified Architect – Foundations Certification Exam Guide, v0.1
