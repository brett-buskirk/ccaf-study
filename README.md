# ccaf-study

Hands-on practice builds for the **Claude Certified Architect – Foundations** exam.

The exam is scenario-based. It describes a production system that is misbehaving and asks for the root cause or the best fix. Reading about agent loops and tool schemas only gets you so far with questions like that. These four builds have you construct each kind of system the exam describes, then break it on purpose so you recognize the failure when a question describes it.

This is an unofficial study aid. It is not affiliated with or endorsed by Anthropic, and it does not include the exam guide.

## The builds

Each directory holds one `README.md` with step-by-step instructions. You write all the code yourself by following along; no finished solutions are checked in.

| Build | What you make | Stack | Exam domains | Time |
| --- | --- | --- | --- | --- |
| [01 Support resolution agent](build-01-support-resolution-agent/README.md) | A support agent with tools, hooks, and escalation, built first on the raw API and then on the Agent SDK | TypeScript, Claude API, Agent SDK | Agentic Architecture, Tool Design and MCP, Context and Reliability | 3–4 h |
| [02 Claude Code team setup](build-02-claude-code-team-setup/README.md) | A repo configured for a team, plus a CI job that reviews pull requests | Claude Code, GitHub Actions | Claude Code Configuration, Tool Design and MCP, Prompt Engineering | 2–3 h |
| [03 Structured extraction pipeline](build-03-structured-extraction-pipeline/README.md) | An invoice extraction pipeline with validation, retries, batch processing, and human-review routing | Python, Claude API, Pydantic | Prompt Engineering and Structured Output, Context and Reliability | 3–4 h |
| [04 Multi-agent research pipeline](build-04-multi-agent-research-pipeline/README.md) | A coordinator and three subagents that produce a cited report | TypeScript, Agent SDK | Agentic Architecture, Context and Reliability | 3–4 h |

Do them in order. Build 4 reuses patterns from Build 1, and each guide assumes you have done the ones before it.

## How each guide is organized

- **What you're building** and three ideas to hold in mind before you start.
- **Setup**, then numbered steps. Each step gives you the code, tells you how to run it, and says what you should see.
- **What to notice, and why** after each step. This is the part that maps to the exam. It ties what you just built to specific task statements from the exam guide.
- **Break it on purpose**, near the end. A set of experiments that each reproduce a failure the exam describes.
- **A checklist** of statements you should be able to explain out loud.

## What you need

- A Claude API key. API usage is billed separately from a Claude subscription. Builds 1 and 3 cost little. Build 4 runs several agents per request and costs more per run; its script prints the cost each time.
- Node 20 or newer for Builds 1, 2, and 4. Python 3.10 or newer for Build 3.
- Claude Code installed and signed in, the `gh` CLI, and `jq` for Build 2.
- The official exam guide, from Anthropic. The task-statement numbers in these guides (such as 1.4 or 5.2) refer to it.

Do your work for Builds 1, 3, and 4 inside each build's directory. The repo's `.gitignore` already excludes dependencies, virtual environments, and the output files the builds generate.

Build 2 is the exception. It has you create a separate scratch repository and push it to GitHub, so make that one outside this repo to avoid nesting one git repository inside another.

## Where the exam guide and current tooling disagree

The guides were written against exam guide version 0.1 (February 2025). The tools have moved since. Each build ends with a table of the differences it ran into. The ones most likely to trip you up:

| Topic | Exam guide | Current tooling |
| --- | --- | --- |
| Forcing a tool call | `tool_choice` of `any` or a named tool works on every model | Current flagship models reject both. Build 3 includes a script to find a model that still accepts them |
| Starting a subagent | The `Task` tool | Named `Agent` in the current Agent SDK |
| Skill `allowed-tools` | Restricts which tools a skill can use | Documented as tools the skill may use without a permission prompt |

On the exam, answer the way the exam guide teaches. In real work, follow the current documentation.

## How far these have been tested

Be aware of the limits before you rely on anything here.

- Code was type-checked or syntax-checked, and everything that can run without the API was run: tool handlers, validators, the sample generators, and the review and scoring scripts. Build 3's pipeline was also run end to end against a stand-in for the API.
- **No guide was run end to end against the live API when it was written.** Where a step says "expect to see X," that is the intended behavior, not recorded output. Model output varies between runs, and more so in the multi-agent build.
- SDK and CLI details were checked against the versions named at the end of each guide. Newer versions may rename options.

Each guide has its own "How far this was tested" section with specifics. If a step doesn't behave as described, that section and the version numbers are the first place to look.

## Notes

These guides were drafted with Claude. Corrections are welcome.
