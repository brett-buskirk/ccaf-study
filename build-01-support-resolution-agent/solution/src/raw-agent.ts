// src/raw-agent.ts: Phase A. The agent loop, written by hand.
import Anthropic from "@anthropic-ai/sdk";
import * as readline from "node:readline/promises";
import { toolDefs, runTool } from "./tools.js";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
const MODEL = "claude-sonnet-5-5";
const SYSTEM =
  "You are a support agent for Northwind Outfitters, an outdoor gear store. " +
  "Verify the customer with get_customer before doing anything else.";

// The entire conversation. The model has no memory, so this array IS its memory.
const messages: Anthropic.MessageParam[] = [];

async function runTurn(userText: string): Promise<string> {
  messages.push({ role: "user", content: userText });

  while (true) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      tools: toolDefs,
      messages,
    });

    // 1. Always record what the model said, tool requests included.
    messages.push({ role: "assistant", content: response.content });

    // 2. Decide what to do based on stop_reason, and nothing else.
    if (response.stop_reason === "end_turn") {
      return response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    }
    if (response.stop_reason !== "tool_use") {
      throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
    }

    // 3. Run every tool the model asked for. There can be more than one.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      console.log(`  [tool] ${block.name}`, JSON.stringify(block.input));
      const result = await runTool(block.name, block.input);
      console.log(`  [result]`, JSON.stringify(result));
      results.push({
        type: "tool_result",
        tool_use_id: block.id,          // ties this result to that request
        content: JSON.stringify(result.data),
        is_error: result.isError,
      });
    }

    // 4. Send the results back as a user message, then loop.
    messages.push({ role: "user", content: results });
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
while (true) {
  const text = await rl.question("\nyou> ");
  if (text === "exit") break;
  console.log("\nagent> " + (await runTurn(text)));
}
rl.close();
