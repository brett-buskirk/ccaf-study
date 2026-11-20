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
