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
