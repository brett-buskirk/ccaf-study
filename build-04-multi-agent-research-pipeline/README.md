# Build 4: Multi-Agent Research Pipeline — Step-by-Step

[Back to the study guide](../README.md) · Last revised Nov 18, 2026 · [Finished code](solution/README.md)

## What you're building

You're building a research system where one coordinator agent hands work to three specialist subagents, then assembles a cited report from what they return. Plan on 3 to 4 hours.

It's TypeScript on the Claude Agent SDK, the same stack as Build 1, and it reuses that build's patterns for tools and structured errors. The new material is everything that happens between agents: who knows what, who can do what, and what gets lost at each handoff.

The sources are a small fictional corpus on your disk, not the live web. That keeps runs repeatable and lets you plant the exact problems the exam asks about: sources that disagree, a search that times out, a topic the coordinator covers too narrowly.

### Three ideas to hold before you start

1. **A subagent starts with an empty head.** It doesn't see the coordinator's conversation, the user's question, or what other subagents found. The only thing it knows is the prompt the coordinator writes for it. Anything you want it to have, you put in that prompt.
2. **Everything goes through the coordinator.** Subagents don't talk to each other. Findings from the searcher reach the synthesizer only because the coordinator copies them into the synthesizer's prompt. This is hub-and-spoke, and it's deliberate: one place to observe, one place to handle errors.
3. **Every handoff is lossy unless you make it structured.** A finding passed as a paragraph loses its source by the second hop. A finding passed as claim, evidence, source, and date keeps them.

Think of the coordinator as a load balancer that also reads the responses. Subagents are stateless backends: each request must carry everything needed to serve it, because the backend remembers nothing from the last one.

### What each step maps to on the exam

| Step | You build | Exam task statements |
| --- | --- | --- |
| 1 | Research tools with structured errors | 2.2, 2.3 |
| 2 | A coordinator and one subagent | 1.2, 1.3 |
| 3 | Three scoped subagents with structured output | 1.3, 2.3, 5.6 |
| 4 | Decomposition, parallel delegation, coverage check | 1.2, 1.3, 1.6 |
| 5 | Error propagation and partial results | 2.2, 5.3 |
| 6 | Conflict handling and provenance | 5.6 |
| 7 | Resume, fork, and a recovery manifest | 1.7, 5.4 |
| 8 | Deliberate breakage | Sample questions 7, 8, 9 |

## Setup

You need Node 22 or newer and your API key. The project setup matches Build 1.

```bash
mkdir research-team && cd research-team
npm init -y
npm pkg set type=module
npm install @anthropic-ai/claude-agent-sdk zod
npm install -D tsx typescript @types/node
mkdir src
export ANTHROPIC_API_KEY="sk-ant-..."
```

**Files you'll end up with.**

| File | Purpose | Created in |
| --- | --- | --- |
| `src/corpus.ts` | Ten fictional sources and the search logic | Setup |
| `src/tools.ts` | Three research tools | Step 1 |
| `src/agents.ts` | The subagent definitions | Steps 2 and 3 |
| `src/probe.ts` | A one-subagent experiment | Step 2 |
| `src/run.ts` | The coordinator | Step 4 |

A full run of this system makes many more model calls than Build 1 did, since each subagent is its own conversation. Expect a run to take a few minutes. The script prints the cost at the end of each one.

### The source corpus

Create `src/corpus.ts`. Every organization and statistic in it is invented for this exercise.

```ts
// src/corpus.ts: a small FICTIONAL source library. Every organization and number is invented.

export type Sector = "visual" | "music" | "writing" | "film" | "cross";

export type Source = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  published: string; // YYYY-MM-DD
  sector: Sector;
  text: string;
};

export const SOURCES: Source[] = [
  {
    id: "S1", sector: "visual", published: "2026-03-12",
    title: "Illustrator Income Survey 2026", publisher: "Northlight Institute",
    url: "https://northlight.example/illustrator-survey-2026",
    text: "In a survey of 2,400 freelance illustrators, 41% reported lower commission income than the year before, and most of them named AI image tools as the main cause. 58% said they now use AI tools themselves for early ideation. The survey was open to any working illustrator and was promoted through social media.",
  },
  {
    id: "S2", sector: "visual", published: "2024-05-20",
    title: "Illustrator Income Survey 2024", publisher: "Northlight Institute",
    url: "https://northlight.example/illustrator-survey-2024",
    text: "In the 2024 edition of this survey, 23% of freelance illustrators reported lower commission income than the year before. 31% said they had tried AI tools for ideation. Method and sample size match the later editions.",
  },
  {
    id: "S3", sector: "visual", published: "2026-04-02",
    title: "Member Poll: Commissions and AI", publisher: "Guild of Working Artists",
    url: "https://workingartists.example/poll-2026",
    text: "A poll of 600 dues-paying guild members found that 19% reported lower commission income over the past year. Respondents were established professionals with an average of eleven years in the field. The guild notes that newer artists, who are not well represented among members, may be affected differently.",
  },
  {
    id: "S4", sector: "music", published: "2026-02-18",
    title: "Session Work After Generative Audio", publisher: "Harbor Audio Research",
    url: "https://harboraudio.example/session-work-2026",
    text: "34% of session musicians surveyed said they had lost jingle or library-music work to generated audio in the past year. AI-generated tracks made up 18% of new uploads to the streaming services sampled in January 2026. Live performance income was unchanged.",
  },
  {
    id: "S5", sector: "music", published: "2025-11-05",
    title: "Royalty Pools and Synthetic Uploads", publisher: "Indie Label Collective",
    url: "https://indielabels.example/royalty-brief",
    text: "AI-generated tracks made up 12% of new uploads to major streaming services in October 2025. Because royalties are paid from a shared pool, the collective estimates that independent artists' per-stream payouts fell by about 4% over the year.",
  },
  {
    id: "S6", sector: "writing", published: "2026-01-27",
    title: "Copywriters and Client Loss", publisher: "Pressroom Workers Union",
    url: "https://pressroomunion.example/copy-survey",
    text: "27% of freelance copywriters said they lost at least one regular client to AI-written copy in 2025. Rates for product descriptions and short marketing copy fell the most. Book authors reported that advances were flat and that contracts now commonly include AI-training clauses.",
  },
  {
    id: "S7", sector: "writing", published: "2026-05-09",
    title: "Editorial Workflow Report", publisher: "Quillmark Publishing",
    url: "https://quillmark.example/workflow-2026",
    text: "63% of editors at the surveyed houses use AI for a first-pass copyedit. Average manuscript turnaround fell by 30%. Editors said the time saved moved to structural editing, and none of the houses reported cutting editorial staff.",
  },
  {
    id: "S8", sector: "film", published: "2026-06-15",
    title: "Previsualization Jobs Study", publisher: "Cutting Room Guild",
    url: "https://cuttingroom.example/previz-study",
    text: "Storyboard and previsualization postings fell 22% between 2024 and 2026. Rotoscoping work in visual effects is now largely automated at the studios surveyed. Demand for on-set crew and editors was stable.",
  },
  {
    id: "S9", sector: "film", published: "2025-09-30",
    title: "Localization Production Note", publisher: "Lumen Studios",
    url: "https://lumenstudios.example/localization-note",
    text: "AI dubbing reduced localization cost per title by 40% and let the studio release in nine more languages. Voice actors were paid a licensing fee for their voice models under a new agreement.",
  },
  {
    id: "S10", sector: "cross", published: "2026-07-01",
    title: "Creative Economy Monitor, Mid-2026", publisher: "Bureau of Creative Statistics",
    url: "https://creativestats.example/monitor-2026h1",
    text: "Total employment across creative industries rose 1.5% year over year. Gains in games, live events, and creative technology roles offset declines in illustration, copywriting, and previsualization.",
  },
];

export class TimeoutError extends Error {}

// FLAKY=once  -> the first search times out, then searches work (a transient blip).
// FLAKY=music -> every search touching music times out (an outage that will not clear).
let blipPending = process.env.FLAKY === "once";

export function search(query: string, sector?: Sector): Source[] {
  const q = query.toLowerCase();
  if (blipPending) {
    blipPending = false;
    throw new TimeoutError("source index timed out");
  }
  if (process.env.FLAKY === "music" && (sector === "music" || /music|audio|song|royalt/.test(q))) {
    throw new TimeoutError("source index timed out");
  }
  const words = q.split(/\W+/).filter((w) => w.length > 3);
  return SOURCES
    .filter((s) => !sector || s.sector === sector)
    .map((s) => {
      const haystack = `${s.title} ${s.publisher} ${s.sector} ${s.text}`.toLowerCase();
      return { source: s, score: words.filter((w) => haystack.includes(w)).length };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((hit) => hit.source);
}

export function getSource(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id.toUpperCase());
}

// Finds a source that contains every number in the claim plus at least two of its longer words.
export function findSupport(claim: string): Source | undefined {
  const numbers = claim.match(/\d+(\.\d+)?/g) ?? [];
  const words = claim.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  return SOURCES.find((s) => {
    const text = s.text.toLowerCase();
    return numbers.every((n) => text.includes(n)) && words.filter((w) => text.includes(w)).length >= 2;
  });
}
```

### What's planted in the corpus

| Sources | What they set up |
| --- | --- |
| S1 and S3 | The same question in the same period, with different answers: 41% versus 19%. The methods differ. A real conflict. |
| S1 and S2 | The same survey in 2026 and 2024: 41% versus 23%. A change over time, not a conflict. |
| S4 and S5 | AI share of uploads: 18% in January 2026, 12% in October 2025. Different dates and publishers. |
| S1 to S9 | Four sectors: visual art, music, writing, film. A coordinator that only thinks of visual art misses three of them. |
| S10 | A cross-sector figure that cuts against the sector-level declines. |
| `FLAKY` | A switch that makes searches time out, once or permanently for music. |

## Step 1: Three research tools

The tools are split by job: one discovers sources, one reads them, one checks a single fact. Each subagent will get exactly one of them. The split is what makes that possible.

Create `src/tools.ts`:

```ts
// src/tools.ts: the three research tools, served from an in-process MCP server.
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { search, getSource, findSupport, TimeoutError } from "./corpus.js";

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });

const fail = (errorCategory: string, isRetryable: boolean, message: string, extra: object = {}) => ({
  content: [{ type: "text" as const, text: JSON.stringify({ errorCategory, isRetryable, message, ...extra }) }],
  isError: true,
});

export const researchServer = createSdkMcpServer({
  name: "research",
  version: "1.0.0",
  alwaysLoad: true,
  tools: [
    tool(
      "search_sources",
      `Search the source library by keyword. Returns up to 4 matches, each with source_id, title, publisher, url, published date, and a short excerpt.
Use this to DISCOVER which sources exist on a subtopic. It does not return full text: use load_document for that.
result_count 0 means the search ran and nothing matched. That is a valid answer, not a failure.
A timeout is returned as an error with isRetryable true.`,
      {
        query: z.string().describe("Keywords, e.g. 'illustrator commission income'"),
        sector: z.enum(["visual", "music", "writing", "film", "cross"]).optional()
          .describe("Restrict to one sector. Omit to search all."),
      },
      async ({ query, sector }) => {
        try {
          const hits = search(query, sector);
          return ok({
            result_count: hits.length,
            results: hits.map((s) => ({
              source_id: s.id, title: s.title, publisher: s.publisher, url: s.url,
              published: s.published, excerpt: s.text.slice(0, 140) + "...",
            })),
          });
        } catch (err) {
          if (err instanceof TimeoutError) {
            return fail("transient", true, "The source index timed out. No results were returned.", {
              attempted_query: query, attempted_sector: sector ?? null,
            });
          }
          throw err;
        }
      },
      { annotations: { readOnlyHint: true } }
    ),
    tool(
      "load_document",
      `Load the full text and metadata of one source by its source_id (for example S4), as returned by search_sources.
Use this to READ a source you already know about. It cannot search.`,
      { source_id: z.string().describe("e.g. S4") },
      async ({ source_id }) => {
        const source = getSource(source_id);
        if (!source) {
          return fail("validation", false, `No source with id "${source_id}". Use an id returned by search_sources.`);
        }
        return ok(source);
      },
      { annotations: { readOnlyHint: true } }
    ),
    tool(
      "verify_fact",
      `Check one specific claim that includes a number, name, or date against the source library.
Returns supported true with the matching source, or supported false.
For quick confirmation of a single fact only. It cannot explore a topic or find new sources.`,
      { claim: z.string().describe("One sentence, e.g. '41% of illustrators reported lower commission income'") },
      async ({ claim }) => {
        const source = findSupport(claim);
        return ok(source
          ? { supported: true, source_id: source.id, title: source.title, url: source.url, published: source.published }
          : { supported: false });
      },
      { annotations: { readOnlyHint: true } }
    ),
  ],
});
```

Check the search logic without spending anything:

```bash
npx tsx -e "import('./src/corpus.js').then(c => console.log(c.search('illustrator commission income').map(s => s.id)))"
```

Expect `[ 'S1', 'S2', 'S3', 'S4' ]`. Then confirm the outage switch:

```bash
FLAKY=music npx tsx -e "import('./src/corpus.js').then(c => { try { c.search('music royalties') } catch (e) { console.log('timed out as planned') } })"
```

### What to notice, and why

- **Each description says what the tool is not for.** "It does not return full text," "It cannot search," "It cannot explore a topic." These boundaries keep a subagent from stretching a tool past its job, the same lesson as Build 1's two similar tools.
- **`verify_fact` is deliberately narrow.** It exists for one subagent, the synthesizer, to confirm a number without a round trip through the coordinator. It's a scoped cross-role tool, and Step 8 shows why it's better than handing over the full search tool.
- **The timeout error carries what was attempted.** `attempted_query` and `attempted_sector` travel with the error. Whoever handles it can retry with a different query instead of repeating the one that failed.
- **Zero results is spelled out as success.** The description says so, and the handler returns it without `isError`. A subagent that confuses "nothing matched" with "the search broke" will make the wrong recovery choice either way.
- **Results carry their metadata from the first hop.** Every hit has an ID, publisher, URL, and date. Provenance that isn't attached at the source can't be recovered later.

## Step 2: One coordinator, one subagent

A subagent is a separate agent the main one can start, with its own instructions, its own tools, and its own blank conversation. The main agent starts one by calling a built-in tool and writing a prompt for it. Before building the team, you'll prove the most important fact about subagents with a small experiment.

### 2a. Define the first subagent

Create `src/agents.ts`:

```ts
// src/agents.ts: the three specialists. Each gets a description, a system prompt, and only the tools its job needs.
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

const FAILURE_FORMAT = `If you cannot complete the assignment, do NOT return an empty list as if it succeeded.
Return this instead:
{"status": "partial" or "failed", "failure_type": "timeout" or other, "attempted": [what you tried],
 "partial_results": [anything you did get], "alternatives": [what the coordinator could try instead]}`;

export const agents: Record<string, AgentDefinition> = {
  "source-searcher": {
    description: "Finds which sources exist on an assigned subtopic. Use for discovery. Returns source IDs and metadata, not analysis.",
    tools: ["mcp__research__search_sources"],
    prompt: `You find sources. You are given one subtopic and nothing else, so work only from your assignment.

Run two or three differently worded searches to cover the subtopic. If a search fails with a retryable error, retry it once before giving up on it.

Return ONLY a JSON object:
{"status": "ok", "subtopic": "...", "sources": [{"source_id", "title", "publisher", "url", "published", "why_relevant"}]}

A search that returns zero matches is a real answer: report it as status "ok" with an empty list and say which queries you ran.
${FAILURE_FORMAT}`,
  },
};
```

An `AgentDefinition` has three parts that matter here:

- `description` tells the coordinator when to use this subagent. It works like a tool description.
- `prompt` is the subagent's system prompt. It's all the standing instruction the subagent has.
- `tools` is the complete list of tools it may use. Leave it out and the subagent inherits everything the parent has.

### 2b. The isolation experiment

Create `src/probe.ts`. The coordinator is told a codename, then asked to relay a question about it to the subagent in exact words:

```ts
// src/probe.ts: one coordinator, one subagent. Does the subagent know what the coordinator knows?
import { query } from "@anthropic-ai/claude-agent-sdk";
import { researchServer } from "./tools.js";
import { agents } from "./agents.js";

const prompt = `The project codename is BLUEHERON.

Do these two things with the source-searcher subagent, each as a separate Agent call with run_in_background set to false:
1. Ask it, in these exact words and nothing more: "What is the project codename?"
2. Ask it to find sources on AI in film production.

Then tell me, word for word, what it answered to the first question, and list the source IDs from the second.`;

for await (const message of query({
  prompt,
  options: {
    model: "claude-sonnet-5-5",
    agents: { "source-searcher": agents["source-searcher"] },
    mcpServers: { research: researchServer },
    tools: ["Agent"],
    allowedTools: ["Agent", "mcp__research__search_sources"],
    settingSources: [],
    maxTurns: 15,
    env: { ...process.env, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1" },
  },
})) {
  if (message.type === "assistant") {
    const who = message.parent_tool_use_id ? "  subagent" : "coordinator";
    for (const block of message.message.content) {
      if (block.type === "tool_use") console.log(`[${who}] ${block.name}`, JSON.stringify(block.input).slice(0, 160));
    }
  } else if (message.type === "result" && message.subtype === "success") {
    console.log("\n" + message.result);
  }
}
```

Run it:

```bash
npx tsx src/probe.ts
```

The subagent should say it doesn't know the codename, or that it wasn't given one. The coordinator knew it the whole time. The subagent never saw the coordinator's conversation, only the one sentence written for it.

The second task should come back with S8 and S9, found by `[  subagent]` search calls in the log.

### What to notice, and why

- **Subagents inherit nothing.** No conversation history, no user request, no memory of earlier calls to the same subagent. If the coordinator's prompt says "analyze the findings above," there is no above. This is the fact the exam tests most often in this domain.
- **The subagent tool has two names.** The exam guide calls it `Task`, and says the coordinator's `allowedTools` must include `"Task"`. In the current SDK it's named `Agent`, which is what this code uses. Same mechanism. Answer `Task` on the exam.
- **`tools: ["Agent"]` versus `allowedTools`.** `tools` sets which built-ins exist for the coordinator: here, only the one that starts subagents. `allowedTools` pre-approves calls so nothing waits on a permission prompt.
- **`parent_tool_use_id` tells you who is speaking.** Messages produced inside a subagent carry the ID of the `Agent` call that started it. That's how the log labels each line.
- **Subagents run in the foreground here.** Current Claude Code can run subagents in the background by default. The environment variable and the `run_in_background` instruction turn that off, so each call returns its result before the coordinator continues. It keeps the flow easy to follow and matches the model the exam describes.

## Step 3: Three scoped subagents with structured output

Now add the other two specialists. Each has one tool and a required output shape. The output shapes are the important part: they are the wire format between agents, and what they keep or drop decides whether the final report can cite anything.

In `src/agents.ts`, add these two entries inside the `agents` object, after `source-searcher`:

```ts
  "document-analyst": {
    description: "Reads specific sources by ID and extracts findings with evidence. Use after sources are known. Needs source IDs in its prompt.",
    tools: ["mcp__research__load_document"],
    prompt: `You read sources and extract findings. You are given a list of source IDs and a research question, and nothing else.

Load each source. For every relevant factual claim, record one finding.

Return ONLY a JSON object:
{"status": "ok", "findings": [{"claim", "evidence_excerpt", "source_id", "source_title", "publisher", "url", "published", "method_note"}]}

Rules:
- evidence_excerpt is copied word for word from the source.
- published is the source's date. Always include it.
- method_note records who was surveyed and how, when the source says.
- If two sources give different numbers for what looks like the same thing, include BOTH as separate findings. Do not choose between them and do not average them.
${FAILURE_FORMAT}`,
  },

  synthesizer: {
    description: "Combines findings from several analysts into themes while keeping every claim tied to its source. Needs the complete findings JSON in its prompt.",
    tools: ["mcp__research__verify_fact"],
    prompt: `You combine findings into a synthesis. Everything you know is in your prompt: you cannot search or load documents.

You have one tool, verify_fact, for confirming a single specific number or date. Use it sparingly. If you need something deeper than a fact check, say so in "needs_more_research" and the coordinator will handle it.

Return ONLY a JSON object:
{"status": "ok",
 "established": [{"statement", "support": [{"source_id", "publisher", "published", "url"}]}],
 "contested": [{"question", "positions": [{"value", "source_id", "publisher", "published", "method_note"}], "why_they_may_differ"}],
 "changes_over_time": [{"measure", "points": [{"value", "published", "source_id"}]}],
 "coverage": [{"area", "status": "covered" or "thin" or "missing", "note"}],
 "needs_more_research": []}

Rules:
- Every statement keeps its source IDs. A statement with no source does not go in.
- Different numbers from the SAME publisher at DIFFERENT dates are a change over time, not a disagreement.
- Different numbers from different publishers for the same period are contested. Report both with attribution and note any difference in method. Never pick a winner.
- In "coverage", list every area the research question implies, including ones you received nothing for.`,
  },
```

There's nothing to run yet. Step 4 puts the team to work. Read the three prompts side by side first.

### What to notice, and why

| Subagent | Its only tool | Why not more |
| --- | --- | --- |
| source-searcher | `search_sources` | Its job is discovery. With `load_document` it would start analyzing. |
| document-analyst | `load_document` | It's handed IDs. With search it would wander off the assignment. |
| synthesizer | `verify_fact` | It works from what it's given. With search it would quietly do its own research and you'd lose track of where claims came from. |

- **Tools outside a role get misused.** An agent with a tool will find a reason to use it. The exam's example is a synthesis agent attempting web searches. Scoping is how you keep each agent doing one job.
- **Each finding is a small record, not a sentence.** Claim, evidence, source, publisher, URL, date, method. Content and metadata travel in separate fields so a later agent can't blur them together.
- **The date is mandatory.** Without `published`, "41%" and "23%" from the same survey look like a contradiction. With it, they're a trend. Step 6 depends on this.
- **The analyst is told not to resolve conflicts.** It reports both numbers. Deciding what a disagreement means is a job for an agent that can see all the findings, and ultimately for the reader.
- **The synthesizer's output keeps the mapping.** Every statement lists its sources. When findings are compressed into prose without that mapping, attribution is gone and can't be rebuilt.
- **`coverage` asks for what's missing.** An agent asked only "what did you find" will never mention what it didn't. The explicit field is what makes gaps visible in Step 5.
- **Each prompt states its own isolation.** "You are given one subtopic and nothing else." It tells the subagent not to assume context that isn't there.
- **The shared failure format** gives every subagent the same way to report trouble. It's used in Step 5.

## Step 4: The coordinator

The coordinator's whole job is in its system prompt: break the topic down, delegate, check what comes back, and assemble the report. It has no research tools of its own, and a hook makes sure of that.

Create `src/run.ts`:

```ts
// src/run.ts: the coordinator. Usage: npx tsx src/run.ts "research topic"
import { query, type HookCallback, type PreToolUseHookInput, type SubagentStopHookInput } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { researchServer } from "./tools.js";
import { agents } from "./agents.js";

const MODEL = "claude-sonnet-5-5";
const MANIFEST = "state/manifest.json";

const COORDINATOR = `You coordinate a research team. You do not search or read sources yourself: you delegate with the Agent tool and assemble what comes back.

Your team (use these exact names as subagent_type):
- source-searcher: discovers which sources exist on ONE subtopic.
- document-analyst: reads sources by ID and extracts findings.
- synthesizer: combines findings into themes with sources attached.

How to work:
1. Decompose the topic. List every major area the topic covers before delegating anything. For a broad topic that means several distinct areas, not variations on one. State the list.
2. Search in parallel. Send one source-searcher per area, all in a single response, each with run_in_background set to false.
3. Analyze. Send the source IDs to document-analyst, split across parallel calls when there are many.
4. Synthesize. Give the synthesizer the COMPLETE findings JSON from every analyst.
5. Check coverage. Compare the synthesis against your list from step 1. If an area is thin or missing and more searching could fix it, delegate one more targeted round, then synthesize again. Do this at most once.
6. Write the report.

Delegation rules:
- A subagent knows only what you write in its prompt. It has not seen the user's request, your plan, or any other subagent's output. Put everything it needs in the prompt, including the full JSON it should work from. Never write "the findings above."
- Tell each subagent the goal and what a good result looks like. Do not script its individual steps.
- If a subagent reports status "partial" or "failed", decide what to do: retry with a different query, try another route, or continue without it. Never treat a failure as "no results."

Report format (Markdown):
## Summary
## Established findings   (each with source publisher and date)
## Contested findings     (each position with its source, date, and method; do not pick a winner)
## Changes over time
## Coverage and gaps      (every area from step 1: covered, thin, or missing, and why)
## Sources                (id, title, publisher, date, url)`;

// ---------- hooks ----------

const start = Date.now();
const clock = () => `${((Date.now() - start) / 1000).toFixed(1).padStart(6)}s`;

// Deterministic guard: the coordinator itself may never call a research tool.
const coordinatorMustDelegate: HookCallback = async (input) => {
  const pre = input as PreToolUseHookInput;
  if (pre.agent_id) return {}; // the call comes from inside a subagent: allowed
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse" as const,
      permissionDecision: "deny" as const,
      permissionDecisionReason: "The coordinator does not use research tools directly. Delegate with the Agent tool.",
    },
  };
};

// Crash recovery: save each subagent's final output the moment it finishes.
const saveSubagentOutput: HookCallback = async (input) => {
  const stop = input as SubagentStopHookInput;
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : [];
  manifest.push({ agent_type: stop.agent_type, finished_at: new Date().toISOString(), output: stop.last_assistant_message ?? "" });
  mkdirSync("state", { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`${clock()}   [done] ${stop.agent_type}`);
  return {};
};

// ---------- command line ----------

const args = process.argv.slice(2);
const take = (flag: string) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args.splice(i, 2)[1];
};
const resumeId = take("--resume");
const forkId = take("--fork");
const recoverAt = args.indexOf("--recover");
const recover = recoverAt !== -1;
if (recover) args.splice(recoverAt, 1);
let prompt = args.join(" ") || "The impact of AI on creative industries";

if (recover && existsSync(MANIFEST)) {
  prompt += `\n\nA previous run of this task crashed. These subagent outputs were saved before it did. Reuse them and delegate only what is still missing:\n${readFileSync(MANIFEST, "utf8")}`;
}

// ---------- run ----------

for await (const message of query({
  prompt,
  options: {
    model: MODEL,
    systemPrompt: COORDINATOR,
    agents,
    mcpServers: { research: researchServer },
    tools: ["Agent"], // the only built-in the coordinator gets
    allowedTools: ["Agent", "mcp__research__*"],
    settingSources: [],
    maxTurns: 40,
    resume: forkId ?? resumeId,
    forkSession: Boolean(forkId),
    env: { ...process.env, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1" },
    hooks: {
      PreToolUse: [{ matcher: "^mcp__research__", hooks: [coordinatorMustDelegate] }],
      SubagentStop: [{ hooks: [saveSubagentOutput] }],
    },
  },
})) {
  if (message.type === "assistant") {
    const indent = message.parent_tool_use_id ? "    " : "";
    for (const block of message.message.content) {
      if (block.type !== "tool_use") continue;
      const input = block.input as Record<string, unknown>;
      const detail = block.name === "Agent"
        ? `-> ${input.subagent_type}: ${input.description}`
        : JSON.stringify(input);
      console.log(`${clock()} ${indent}[${block.name.replace("mcp__research__", "")}] ${detail}`);
    }
  } else if (message.type === "result") {
    console.log(`\nsession: ${message.session_id}`);
    if (message.subtype === "success") {
      console.log(`cost: $${message.total_cost_usd.toFixed(3)}   time: ${(message.duration_ms / 1000).toFixed(0)}s\n`);
      console.log(message.result);
      mkdirSync("reports", { recursive: true });
      writeFileSync(`reports/${message.session_id}.md`, message.result);
    } else {
      console.log(`[ended: ${message.subtype}]`);
    }
  }
}
```

Run it on the default topic, "The impact of AI on creative industries":

```bash
rm -rf state && npx tsx src/run.ts
```

### Reading the log

Each line starts with seconds since launch. Top-level lines are the coordinator. Indented lines are tool calls made inside a subagent. `[done]` marks a subagent finishing.

Look for four things:

1. **The decomposition.** The first `[Agent]` lines show which areas the coordinator chose. For this topic you want visual art, music, writing, and film at least.
2. **Parallel delegation.** Several `[Agent] -> source-searcher` lines with nearly the same timestamp mean they were issued in one response and ran together. If each starts only after the previous `[done]`, they ran one at a time.
3. **Explicit context passing.** The analysts' `load_document` calls use IDs the searchers found. The only way those IDs got there is the coordinator writing them into the analyst's prompt.
4. **The coverage check.** After the first synthesis, a second round of delegation means the coordinator found a gap and went back for it.

Save the `session:` ID printed at the end. Step 7 uses it. The report is also written to `reports/`.

### What to notice, and why

- **Parallel means several calls in one response.** The coordinator emits multiple `Agent` tool calls in a single turn, and they run concurrently. One call per turn is sequential, however fast each is. The guide phrases this as multiple `Task` calls in a single coordinator response.
- **The prompt gives goals and quality criteria, not a script for each subagent.** "Tell each subagent the goal and what a good result looks like." A subagent told exactly which three queries to run can't adapt when the first returns nothing.
- **Decomposition is where coverage is won or lost.** Step 1 of the prompt forces the coordinator to list areas before delegating. If that list is narrow, every subagent can do perfect work and the report is still incomplete. Sample Question 7 is exactly this, and Step 8 has you cause it.
- **The coverage check is an iterative refinement loop.** Synthesize, compare against the plan, re-delegate for gaps, synthesize again. It's capped at one extra round so it can't spin.
- **The coordinator decides how much of the team to use.** For a narrow question it may skip a stage or use fewer searchers. Routing every query through the full pipeline regardless of need is something the exam counts against a design.
- **The hook enforces the hub-and-spoke rule.** The prompt says the coordinator doesn't research. The `PreToolUse` hook guarantees it: a research tool call with no `agent_id` came from the main thread and is denied. Prompt for judgment, hook for the rule, as in Build 1.
- **`maxTurns: 40` is a fuse.** The loop still ends on its own when the coordinator has nothing left to call.

## Step 5: When a subagent fails

In a multi-agent system, a failure three layers down has to travel back up in a form the coordinator can act on. There are two ways to get this wrong, and they're opposites: hide the failure, or let it kill everything. This step runs both kinds of outage you built into the corpus.

### 5a. A blip: handled locally

```bash
rm -rf state && FLAKY=once npx tsx src/run.ts
```

The first search of the run times out, then the index recovers. In the log, one searcher's first `search_sources` call is followed by a second call from the same subagent. The searcher's prompt told it to retry a retryable error once, and the tool's error said `isRetryable: true`.

The report should be complete, and the coordinator may never mention the blip. That's correct. A transient failure that a subagent can fix itself shouldn't cost the coordinator any attention.

### 5b. An outage: propagated with context

```bash
rm -rf state && FLAKY=music npx tsx src/run.ts
```

Now every music-related search times out, and retrying doesn't help. Watch what the music searcher does, then open `state/manifest.json` and find its output. It should be the failure format from `agents.ts`:

- `status` of "failed" or "partial"
- `failure_type` naming the timeout
- `attempted` listing the queries it tried
- `partial_results` with anything it did get
- `alternatives` suggesting what else could work

Then read the final report's "Coverage and gaps" section. Music should be listed as missing or thin, with the reason. The other three sectors should be fully reported.

The coordinator may also try a recovery of its own, such as a searcher with different wording. With `FLAKY=music` those fail too, and it should stop after the one extra round the prompt allows.

### What to notice, and why

Sample Question 8 gives four ways to handle this exact timeout. You've now seen the right one work.

| Approach | What happens |
| --- | --- |
| Return structured error context: failure type, what was tried, partial results, alternatives | The coordinator can retry differently, route around it, or proceed and say so. Correct. |
| Retry inside the subagent, then return a generic "search unavailable" | The retry is fine. The generic status throws away everything the coordinator needs to decide. |
| Catch the timeout and return an empty result marked successful | The coordinator believes there are no music sources. The report is silently wrong. |
| Let the exception end the whole workflow | Three sectors of good research are discarded because of one. |

- **Recover locally first, then escalate.** The searcher retried once on its own. Only when that failed did it report upward. Subagents handle what they can and propagate what they can't, along with what they tried.
- **A failure and an empty result are different facts.** "I searched and found nothing on music" is a finding. "I couldn't search for music" is a gap. The first belongs in the report body, the second in the coverage section. The whole error design exists to keep them apart.
- **Partial results are still results.** One failed branch doesn't invalidate the others. The coordinator proceeds with what it has.
- **The report says what it doesn't cover.** A reader of the `FLAKY=music` report can see music wasn't researched and why. Without coverage annotations, an incomplete report looks identical to a complete one.
- **Structure flows through every layer.** The tool returned a structured error, the subagent returned a structured failure, the synthesizer has a `coverage` field, and the report has a gaps section. Drop the structure at any one layer and the information stops there.

## Step 6: Conflicts, dates, and provenance

This step is about what the report does when sources disagree. There's no new code. You run a focused question and check the output against what you know is in the corpus.

```bash
rm -rf state && npx tsx src/run.ts "How has AI affected illustrators' commission income, and how common are AI-generated music uploads?"
```

This question lands on all three planted traps. Check the report for each.

### 6a. The real conflict

S1 says 41% of illustrators reported lower income. S3 says 19%. Both are from spring 2026.

In the report, this belongs under "Contested findings" with both numbers, each attributed to its publisher and date, and a note on method: S1 was an open survey promoted on social media, S3 polled established guild members. The report should not settle on one number, average them, or mention only one.

### 6b. The change over time

S1 says 41% in 2026. S2, the same survey two years earlier, says 23%.

This belongs under "Changes over time," not under contested findings. Same publisher, same method, different dates. If the report calls this a disagreement, a date was dropped somewhere between the analyst and the synthesizer.

### 6c. The one that could go either way

S4 reports AI tracks at 18% of uploads in January 2026. S5 reports 12% in October 2025. Different publishers, different samples, three months apart.

A good report gives both figures with their dates and sources and notes that the gap could be growth, a difference in which services were sampled, or both. That is an honest reading of two data points.

### 6d. Trace one claim end to end

Pick any number in the final report. Find it in `state/manifest.json` in the synthesizer's output, then in an analyst's `findings`, then in `src/corpus.ts`. At each hop, the source ID, publisher, and date should still be attached. That chain is provenance.

### What to notice, and why

- **Attribution dies in summarization unless you carry it.** Every agent in this pipeline could have returned a nicely written paragraph. Each paragraph would have dropped a few source links, and by the report there'd be none. Structured claim-source mappings, preserved and merged at each step, are the only defense.
- **Conflicts are annotated, not resolved.** When two credible sources disagree, the report presents both with attribution. Choosing one arbitrarily makes the report look more certain than the evidence is.
- **Dates turn false contradictions into trends.** Without `published`, 41% and 23% look like one of them is wrong. Requiring dates in every structured output is what prevents that misreading.
- **Method notes explain disagreement.** The `method_note` field is why the report can say the two surveys sampled different populations. Preserving how a source characterized its own work matters as much as preserving its number.
- **The analyst reports, and someone with the full picture decides.** The analyst included both conflicting values and flagged nothing as wrong. Reconciliation happened later, where all findings were visible.
- **Established and contested are separate sections.** A reader can tell at a glance which claims rest on agreement and which don't.
- **Different content deserves different formats.** If your report rendered the time series as a small table and the findings as prose, that's the right instinct. Forcing every kind of content into one uniform format loses clarity, and the exam guide calls this out.

## Step 7: Sessions, forks, and crash recovery

A research run is expensive. You don't want to redo it to ask a follow-up, to try two ways of presenting the result, or because the process died near the end. This step covers the three tools for that.

You need the `session:` ID from your Step 4 run. If you've lost it, run Step 4 again.

### 7a. Resume: continue the same conversation

```bash
npx tsx src/run.ts --resume <session-id> "Add a short section on what the sources say about voice actors. Use what you already have if it covers this."
```

The coordinator picks up with its whole earlier conversation intact: its plan, every subagent's output, the report. It should answer from the S9 findings it already holds, with little or no new delegation. Compare the cost line to the original run.

### 7b. Fork: branch from a shared baseline

```bash
npx tsx src/run.ts --fork <session-id> "Rewrite the report as a one-page brief for an executive with two minutes."
npx tsx src/run.ts --fork <session-id> "Rewrite the report as a skeptic's review: for each finding, what would have to be true for it to be wrong?"
```

Each command prints a new session ID. Both branches start from the same finished research and go different ways, and neither changes the original. Resume the original afterward and it knows nothing about either fork.

In the code, a fork is `resume` plus `forkSession: true`.

### 7c. Recover from a crash

Start a run and kill it partway:

```bash
rm -rf state && npx tsx src/run.ts
# wait for three or four [done] lines, then press Ctrl+C
cat state/manifest.json | head -30
```

The `SubagentStop` hook wrote each subagent's output to `state/manifest.json` as it finished, so the completed work survived. Now restart:

```bash
npx tsx src/run.ts --recover
```

This is a brand-new session. The saved outputs are injected into its prompt, and the coordinator is told to reuse them. Watch the log: it should skip the searches that already completed and delegate only what's missing.

### What to notice, and why

| Situation | Use | Why |
| --- | --- | --- |
| Follow-up on work that's still valid | Resume | The context is intact and correct |
| Compare two approaches from the same analysis | Fork | Independent branches, shared baseline, original untouched |
| Earlier tool results are stale, or the session is gone | New session with an injected summary | Reliable context beats inherited context you can't trust |

- **Resume is only as good as the context it restores.** Here the corpus doesn't change, so resuming is safe. In a codebase, files change between sessions. A resumed session will reason from tool results that are no longer true unless you tell it what changed. The exam's position: when prior results are stale, start fresh with a structured summary instead.
- **If you do resume after changes, say what changed.** Naming the specific files that were modified lets the agent re-check just those, instead of either trusting everything or re-exploring everything.
- **The manifest is structured state at a known location.** Each agent's result is exported as it completes. On restart, the coordinator loads the manifest and injects it. That's the crash-recovery pattern from task 5.4, and it doesn't depend on the old session surviving.
- **Recovery uses a new session on purpose.** A session killed mid-tool-call can be in an awkward state. Rebuilding from saved outputs is cleaner than trusting a half-finished transcript.
- **The same idea protects long sessions that don't crash.** Writing key findings to a file as you go, and reading them back later, counters the gradual loss of detail in a long context. The guide calls these scratchpad files.
- **Names on the exam.** The guide writes resume as `--resume <session-name>` and fork as `fork_session`. In this SDK they're the `resume` and `forkSession` options.

## Step 8: Break it on purpose

Each experiment reproduces a failure the exam describes. Run `rm -rf state` before each, and undo each change before the next. Multi-agent runs aren't cheap, so pick the three or four that interest you most if you're watching cost. The first two are the ones most worth doing.

### Experiment 1: A narrow decomposition (Sample Question 7)

In `COORDINATOR`, replace step 1 with:

```text
1. Decompose the topic into exactly three subtopics: AI in digital art creation, AI in graphic design, and AI in photography.
```

Also delete step 5, the coverage check. Run the default topic.

Every subagent succeeds. The searchers find sources, the analysts extract findings, the synthesizer produces a clean synthesis. And the report covers only visual art, with nothing on music, writing, or film.

The lesson is in where you'd look. Nothing downstream is broken. The exam offers three distractors that blame the synthesizer, the searcher's queries, or the analyst's filtering. The coordinator's log shows the cause directly: the assignments never included those areas.

### Experiment 2: Give the synthesizer everything (Sample Question 9)

In `agents.ts`, set the synthesizer's tools to all three research tools. Run the Step 6 question.

Look in the log for indented `search_sources` and `load_document` calls under the synthesizer. Then check its output in the manifest for claims whose sources no analyst ever reported. The synthesizer has started doing its own research, and the coordinator has lost track of where claims come from.

Now try the opposite: set its tools to an empty list, removing `verify_fact`. Simple fact checks now have to go back through the coordinator as `needs_more_research`, costing extra round trips.

The scoped tool is the middle path the exam wants: a narrow tool for the common simple case, with anything complex still routed through the coordinator.

### Experiment 3: Starve the subagents of context (task 1.3)

In `COORDINATOR`, delete the first delegation rule and add: `Keep every subagent prompt under 30 words.`

To see the prompts, change the log line for `Agent` calls to print `input.prompt` instead of `input.description`. Run the default topic.

The analyst gets asked to "analyze the sources found" with no IDs. The synthesizer gets asked to "synthesize the findings" with no findings. Watch them fail or, worse, improvise.

### Experiment 4: Swallow the error (Sample Question 8)

In `tools.ts`, change the timeout handler to return an empty success:

```ts
            return ok({ result_count: 0, results: [] });
```

Run with `FLAKY=music`. Compare the "Coverage and gaps" section to your Step 5b report. Before, it said the music search failed. Now it says no music sources exist, or doesn't mention music at all. The report is wrong and nothing in it says so.

### Experiment 5: Drop the dates (task 5.6)

In the analyst's prompt, remove `"published"` from the output format and delete the rule about it. Run the Step 6 question.

Check how the report treats 41% versus 23%. Without dates, the 2024 and 2026 editions of the same survey can look like two sources that disagree.

### Experiment 6: One at a time (task 1.3)

Change step 2 of `COORDINATOR` to: `Send one source-searcher at a time and wait for each to finish before sending the next.` Run the default topic and compare the `time:` line to your Step 4 run. Then look at the timestamps on the `[Agent]` lines to see why.

## Checklist and exam mapping

- [ ] I can explain hub-and-spoke and why subagents don't talk to each other (1.2)
- [ ] I proved to myself that a subagent doesn't inherit the coordinator's context (1.2, 1.3)
- [ ] I know which tool starts a subagent and what `allowedTools` needs (1.3)
- [ ] I can name the parts of an `AgentDefinition` (1.3)
- [ ] I passed complete findings explicitly in a subagent's prompt (1.3)
- [ ] I can say what makes delegation parallel (1.3)
- [ ] My coordinator prompt gives goals and quality criteria, not step scripts (1.3)
- [ ] I can diagnose a too-narrow decomposition from a coordinator's log (1.2)
- [ ] I built a coverage check that re-delegates for gaps (1.2)
- [ ] Each of my subagents has only the tools for its role (2.3)
- [ ] I can explain the scoped cross-role tool and its two worse alternatives (2.3)
- [ ] My subagents recover locally from transient errors and propagate the rest (2.2, 5.3)
- [ ] I can tell a failed search from an empty result, at every layer (5.3)
- [ ] My report says what it doesn't cover (5.3)
- [ ] My findings carry claim, evidence, source, and date through every hop (5.6)
- [ ] My report separates contested findings from established ones (5.6)
- [ ] I can tell a change over time from a conflict (5.6)
- [ ] I can choose between resume, fork, and a fresh session with a summary (1.7)
- [ ] I recovered a crashed run from a manifest (5.4)
- [ ] I ran at least the first two experiments in Step 8

### Where the guide and current tooling differ

The exam guide is version 0.1 from February 2025. Answer the guide's way on the exam.

| Topic | Exam guide says | Current SDK (0.3.322) |
| --- | --- | --- |
| Subagent tool | `Task`; `allowedTools` must include `"Task"` | Named `Agent` |
| Forking | `fork_session` | The `forkSession` option, used with `resume` |
| Resuming | `--resume <session-name>` | The `resume` option takes a session ID |
| How subagents run | The coordinator waits for each result | Background by default; this build turns that off |

### How far this was tested

- All five source files type-check under strict TypeScript against `@anthropic-ai/claude-agent-sdk` 0.3.322.
- The corpus search, the outage switch, and the fact-check lookup were run directly and return what the doc says.
- Option names, the `AgentDefinition` fields, the subagent tool's name and inputs, the hook input fields (`agent_id`, `agent_type`, `last_assistant_message`), and `forkSession` were read from the SDK's own type definitions.
- Nothing was run against the live API. Everything this doc says the agents will do is expected behavior: which areas the coordinator picks, whether it parallelizes, how the report is laid out, and what each experiment produces. Multi-agent output also varies more between runs than a single agent's does.
- One thing to watch on your first run: whether the `PreToolUse` hook sees `agent_id` on subagent tool calls. The types say it does. If subagents' research calls are being denied, that's the place to look.

### Sources

- `@anthropic-ai/claude-agent-sdk` 0.3.322 type definitions (`sdk.d.ts`, `sdk-tools.d.ts`), read directly
- [Give Claude custom tools](https://code.claude.com/docs/en/agent-sdk/custom-tools.md) and [Intercept and control agent behavior with hooks](https://code.claude.com/docs/en/agent-sdk/hooks.md), read in full for Build 1
- Claude Certified Architect – Foundations Certification Exam Guide, v0.1: task statements 1.2, 1.3, 1.6, 1.7, 2.3, 5.3, 5.4, 5.6, Scenario 3, and Sample Questions 7 to 9
