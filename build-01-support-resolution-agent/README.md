# Build 1: Support Resolution Agent — Step-by-Step

[Back to the study guide](../README.md) · Last revised Nov 24, 2026 · [Finished code](solution/README.md)

## What you're building

You're building a command-line support agent for a fake online store. It verifies customers, looks up orders, issues refunds, and hands off to a human when it should. Plan on 3 to 4 hours.

You build it twice, on purpose:

- **Phase A (Steps 1–3): raw Claude API.** You write the agent loop by hand, about 40 lines. The exam tests this loop directly, and the Agent SDK hides it.
- **Phase B (Steps 4–7): Claude Agent SDK.** The SDK runs the loop for you. You add the parts the exam cares about most: MCP tools, hooks, and escalation.

Think of Phase A as writing a systemd unit by hand once before you let Ansible template it forever. You only need to do it once, but you need to have done it.

### Three ideas to hold before you type anything

1. **The model never runs anything.** It only replies with a request: "call `lookup_order` with these arguments." Your code runs the function and sends the result back. An "agent" is that exchange repeated in a loop.
2. **The model has no memory between requests.** Every API call resends the whole conversation so far. If you don't append a tool result to the history, the model never saw it.
3. **A tool's description is all the model knows about it.** The model can't read your function body. A vague description gets you vague tool choices.

### What each step maps to on the exam

| Step | You build | Exam task statements |
| --- | --- | --- |
| 1 | Four tools with careful descriptions | 2.1 |
| 2 | The agent loop, by hand | 1.1 |
| 3 | Structured error responses | 2.2 |
| 4 | The same agent on the Agent SDK | 1.1, 2.3, 2.4 |
| 5 | A prerequisite gate and a $500 refund hook | 1.4, 1.5 |
| 6 | Escalation rules, case facts, handoff summary | 1.4, 5.1, 5.2 |
| 7 | Deliberate breakage | Sample questions 1–3 |

## Setup

You need Node 22 or newer and a Claude API key. Everything is TypeScript, run directly with `tsx`, so there is no build step.

**Get an API key.** Create one in the Claude Console. API usage is billed separately from a Claude subscription. This build makes a few dozen short requests.

**Create the project.**

```bash
mkdir support-agent && cd support-agent
npm init -y
npm pkg set type=module
npm install @anthropic-ai/sdk @anthropic-ai/claude-agent-sdk zod
npm install -D tsx typescript @types/node
mkdir src
export ANTHROPIC_API_KEY="sk-ant-..."   # your key; keep it out of git
```

What each package is for:

- `@anthropic-ai/sdk` is the plain API client. You send messages, you get a response. Phase A uses it.
- `@anthropic-ai/claude-agent-sdk` is the engine behind Claude Code, packaged as a library. It runs the loop, tools, and hooks. Phase B uses it.
- `zod` describes the shape of tool inputs. The Agent SDK requires it for tool schemas.

**Files you'll end up with.**

| File | Purpose | Created in |
| --- | --- | --- |
| `src/backend.ts` | Fake customer and order database | Step 1 |
| `src/tools.ts` | Tool descriptions, schemas, and handlers | Step 1 |
| `src/raw-agent.ts` | Phase A: hand-written loop | Step 2 |
| `src/sdk-agent.ts` | Phase B: Agent SDK version | Step 4 |

One TypeScript quirk: imports between your own files end in `.js` even though the files are `.ts`. That's how ES modules work with TypeScript, and `tsx` resolves it for you.

A model name appears in the code as `claude-sonnet-5-5`. Any current model works; swap it if you prefer a cheaper one.

## Step 1: Mock backend and four tools

You write two files with no AI in them yet: a fake database, and the four tools the agent will be allowed to call.

### 1a. The fake backend

Create `src/backend.ts`. The data is rigged to cause specific problems later: two customers share a name, one order costs more than $500, and orders carry noise fields and awkward formats.

```ts
// src/backend.ts: a pretend database. No AI in this file.

export type Customer = { id: string; name: string; email: string };

export type Order = {
  id: string;
  customerId: string;
  item: string;
  total: number;
  statusCode: 1 | 2 | 3;       // 1 processing, 2 shipped, 3 delivered
  deliveredAt: number | null;  // Unix seconds
  warehouseBin: string;        // noise the agent never needs
  carrierRouteCode: string;    // more noise
};

const customers: Customer[] = [
  { id: "C-1001", name: "Dana Whitfield", email: "dana@example.com" },
  { id: "C-1002", name: "Dana Whitfield", email: "dwhitfield@example.com" },
  { id: "C-1003", name: "Marcus Oyelaran", email: "marcus@example.com" },
];

// Delivery dates are relative to when the process starts, so the 30-day refund window
// in Step 6 holds no matter when you do this build.
const DAY = 86_400;
const now = Math.floor(Date.now() / 1000);

const orders: Order[] = [
  { id: "ORD-5001", customerId: "C-1001", item: "Trail headlamp", total: 48,
    statusCode: 3, deliveredAt: now - 12 * DAY, warehouseBin: "A-14", carrierRouteCode: "RX-22" },
  { id: "ORD-5002", customerId: "C-1003", item: "Four-season tent", total: 729,
    statusCode: 3, deliveredAt: now - 8 * DAY, warehouseBin: "D-02", carrierRouteCode: "RX-31" },
  { id: "ORD-5003", customerId: "C-1003", item: "Camp stove", total: 89.5,
    statusCode: 2, deliveredAt: null, warehouseBin: "B-07", carrierRouteCode: "RX-09" },
];

export class TimeoutError extends Error {}

// Run with FLAKY=1 to make the first order lookup time out (used in Step 3).
let flaky = process.env.FLAKY === "1";

export function findCustomers(q: { email?: string; name?: string }): Customer[] {
  const email = q.email?.toLowerCase();
  const name = q.name?.toLowerCase();
  return customers.filter(
    (c) => c.email.toLowerCase() === email || c.name.toLowerCase() === name
  );
}

export function getOrder(orderId: string): Order | undefined {
  if (flaky) {
    flaky = false;
    throw new TimeoutError("order service timed out");
  }
  return orders.find((o) => o.id === orderId);
}

export function issueRefund(orderId: string, amount: number) {
  return { refundId: `RF-${Date.now()}`, orderId, amount };
}

export function createTicket(handoff: unknown) {
  console.log("\n--- HANDOFF TICKET ---");
  console.log(JSON.stringify(handoff, null, 2));
  console.log("----------------------\n");
  return { ticketId: `T-${Date.now()}`, queue: "tier-2" };
}
```

### 1b. The tools

A tool has three parts: a name, a description, and an input schema. The model sees all three. A fourth part, the handler, is your code and the model never sees it.

Create `src/tools.ts`. Read the descriptions closely; they are the lesson of this step.

```ts
// src/tools.ts
import type Anthropic from "@anthropic-ai/sdk";
import { findCustomers, getOrder, issueRefund, createTicket } from "./backend.js";

// ---------- Descriptions: the model's only documentation ----------
export const descriptions = {
  get_customer: `Find and verify a customer account. Call this FIRST in every conversation, before any order lookup or refund.
Input: the account email (preferred) or the customer's full name.
Returns match_count and a list of matching accounts (customer_id, name, email).
If match_count is greater than 1, do not pick one: ask the customer for the email on the account.
If match_count is 0, the search worked and nobody matched: ask the customer to confirm their details.
This tool does NOT return orders, and an order ID is never a valid input here. Use lookup_order for orders.`,

  lookup_order: `Retrieve one order by its order ID (format ORD-1234).
Requires the customer_id returned by get_customer.
Returns item, total in USD, status, and delivery time.
Use for requests like "where is my order", "check order ORD-5001", or before any refund.
This tool does NOT look up people. To identify a customer, use get_customer.`,

  process_refund: `Refund money to the customer's original payment method. This moves real money and cannot be undone.
Requires customer_id from get_customer and an order_id you have already confirmed with lookup_order.
Only delivered orders can be refunded, and amount cannot exceed the order total.
Refunds over $500 cannot be processed here: use escalate_to_human instead.`,

  escalate_to_human: `Hand the conversation to a human support agent.
Use when the customer asks for a human, when policy does not cover the request, when a refund exceeds $500, or when you cannot make progress.
The human will NOT see this conversation. Every field must make sense on its own.
Use null for customer_id or refund_amount when they do not apply. Never invent a value.`,
};

// ---------- Schemas in JSON Schema form (what the raw API expects) ----------
export const toolDefs: Anthropic.Tool[] = [
  {
    name: "get_customer",
    description: descriptions.get_customer,
    input_schema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Email on the account. Preferred." },
        name: { type: "string", description: "Full name. Only if no email is available." },
      },
    },
  },
  {
    name: "lookup_order",
    description: descriptions.lookup_order,
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "From get_customer, e.g. C-1001" },
        order_id: { type: "string", description: "e.g. ORD-5001" },
      },
      required: ["customer_id", "order_id"],
    },
  },
  {
    name: "process_refund",
    description: descriptions.process_refund,
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        order_id: { type: "string" },
        amount: { type: "number", description: "USD" },
        reason: { type: "string" },
      },
      required: ["customer_id", "order_id", "amount", "reason"],
    },
  },
  {
    name: "escalate_to_human",
    description: descriptions.escalate_to_human,
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: ["string", "null"] },
        summary: { type: "string", description: "What the customer wants, in two sentences" },
        root_cause: { type: "string", description: "Why this needs a human" },
        recommended_action: { type: "string" },
        refund_amount: { type: ["number", "null"], description: "USD, if a refund is involved" },
      },
      required: ["customer_id", "summary", "root_cause", "recommended_action", "refund_amount"],
    },
  },
];

// ---------- Handlers: your code. The model never sees this. ----------
export type ToolResult = { isError: boolean; data: unknown };
const ok = (data: unknown): ToolResult => ({ isError: false, data });

const handlers: Record<string, (input: any) => Promise<ToolResult>> = {
  async get_customer({ email, name }) {
    const matches = findCustomers({ email, name });
    return ok({ match_count: matches.length, customers: matches });
  },

  async lookup_order({ customer_id, order_id }) {
    const order = getOrder(order_id);
    if (!order || order.customerId !== customer_id) return ok({ found: false });
    // Return only the fields the agent needs. The noise stays here.
    const { id, item, total, statusCode, deliveredAt } = order;
    return ok({ found: true, order: { id, item, total, statusCode, deliveredAt } });
  },

  async process_refund({ order_id, amount }) {
    const order = getOrder(order_id);
    if (!order) throw new Error("no such order");
    if (order.statusCode !== 3) throw new Error("not delivered");
    if (amount > order.total) throw new Error("amount too high");
    return ok(issueRefund(order_id, amount));
  },

  async escalate_to_human(input) {
    return ok(createTicket(input));
  },
};

export async function runTool(name: string, input: any): Promise<ToolResult> {
  const handler = handlers[name];
  if (!handler) return { isError: true, data: `Unknown tool: ${name}` };
  try {
    return await handler(input);
  } catch {
    return { isError: true, data: "Operation failed" }; // deliberately bad. Step 3 fixes it.
  }
}
```

### What to notice, and why

- **`get_customer` and `lookup_order` are deliberately similar.** Both take an ID-like string and both "look something up." Each description says what the tool is for, what it accepts, what it returns, and when to use the other one instead. That last part is what stops misrouting. Sample Question 2 on the exam is this exact situation.
- **The descriptions spell out edge cases.** Zero matches and multiple matches are described in advance, so the model has a plan when it hits them.
- **`lookup_order` trims its output.** A real order record has 40 fields. Every field you return gets resent on every later request, so trimming at the source is the cheapest context management there is (task 5.1).
- **`escalate_to_human` uses nullable fields.** If a field is required and non-nullable, the model will invent a value to satisfy the schema. Allowing `null` gives it an honest way out (task 4.3).
- **`runTool` returns "Operation failed" for every error.** That's wrong on purpose. You'll watch it hurt in Step 3.

## Step 2: Hand-write the agent loop

The loop is: ask the model, check why it stopped, run any tools it asked for, send the results back, repeat. The field that tells you why it stopped is `stop_reason`.

Create `src/raw-agent.ts`:

```ts
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
```

Run it:

```bash
npx tsx src/raw-agent.ts
```

Try: `Hi, I'm marcus@example.com. Where is my stove? Order ORD-5003.`

You should see two `[tool]` lines, `get_customer` then `lookup_order`, followed by an answer saying the stove has shipped. Your code never dictated that sequence. The model read the descriptions and chose it.

### What to notice, and why

- **`stop_reason` is the only control signal.** `"tool_use"` means "I'm waiting on you, run these and come back." `"end_turn"` means "I'm done." The loop continues on the first and stops on the second.
- **Tool results go back as a `user` message.** That looks odd at first. From the model's side, anything it didn't write itself arrives as user input. Each result carries the `tool_use_id` of the request it answers.
- **The assistant message is appended before the results.** If you skip that, the next request contains answers to questions nobody asked, and the API rejects it.
- **The model decided the tool order.** This is "model-driven" control flow. The alternative, hard-coding "always call A then B," is a decision tree. The exam expects you to tell these apart.

### Three anti-patterns the exam names

| Anti-pattern | Why it fails |
| --- | --- |
| Stopping when the reply contains text | The model often says "Let me look that up" alongside a tool request. Text is not a completion signal. |
| Parsing the text for words like "done" | Natural language is not a protocol. `stop_reason` is. |
| An iteration cap as the main way to stop | It cuts off long legitimate tasks and lets short broken ones spin. A cap is a fuse, not a thermostat. |

Try the first one yourself: add `if (response.content.some((b) => b.type === "text")) return "stopped early";` right after step 1 and rerun the same request a few times. When the model narrates before calling a tool, the agent quits mid-task. Remove the line afterward.

## Step 3: Structured error responses

An error message is the agent's only clue about what to do next, so "Operation failed" leaves it guessing. You'll see the bad behavior first, then fix it.

### 3a. Watch the generic error hurt

```bash
FLAKY=1 npx tsx src/raw-agent.ts
```

Try: `I'm marcus@example.com. Where is order ORD-5003?`

The first order lookup times out and the agent gets "Operation failed." It can't tell a blip from a permanent problem. It may retry blindly, apologize and give up, or ask you to repeat yourself. Run it twice; the inconsistency is the point.

Now try (without `FLAKY`): `I'm marcus@example.com. Refund my stove, ORD-5003, $89.50.`

The stove hasn't been delivered, so the refund is refused. Again the agent only sees "Operation failed" and has nothing useful to tell the customer.

### 3b. Fix it

In `src/tools.ts`, add the error helper under the `ok` line, and import `TimeoutError`:

```ts
import { findCustomers, getOrder, issueRefund, createTicket, TimeoutError } from "./backend.js";
```

```ts
type ErrorCategory = "transient" | "validation" | "business" | "permission";

const fail = (errorCategory: ErrorCategory, isRetryable: boolean, message: string): ToolResult => ({
  isError: true,
  data: { errorCategory, isRetryable, message },
});
```

Replace the `lookup_order` and `process_refund` handlers:

```ts
  async lookup_order({ customer_id, order_id }) {
    if (!/^ORD-\d{4}$/.test(order_id)) {
      return fail("validation", false, `"${order_id}" is not a valid order ID. Expected format: ORD-5001.`);
    }
    const order = getOrder(order_id);
    if (!order) return ok({ found: false }); // a successful search with no match is NOT an error
    if (order.customerId !== customer_id) {
      return fail("permission", false, `Order ${order_id} does not belong to customer ${customer_id}. Do not share its details.`);
    }
    const { id, item, total, statusCode, deliveredAt } = order;
    return ok({ found: true, order: { id, item, total, statusCode, deliveredAt } });
  },

  async process_refund({ customer_id, order_id, amount }) {
    const order = getOrder(order_id);
    if (!order || order.customerId !== customer_id) {
      return fail("validation", false, `No order ${order_id} on customer ${customer_id}. Confirm it with lookup_order first.`);
    }
    if (order.statusCode !== 3) {
      return fail("business", false, "This order has not been delivered yet, so it cannot be refunded. Tell the customer a refund becomes available once it arrives.");
    }
    if (amount > order.total) {
      return fail("validation", false, `Amount ${amount} exceeds the order total of ${order.total}.`);
    }
    return ok(issueRefund(order_id, amount));
  },
```

Replace the `catch` in `runTool`:

```ts
  } catch (err) {
    if (err instanceof TimeoutError) {
      return fail("transient", true, "The order service timed out. Nothing was changed. Safe to retry once.");
    }
    return fail("transient", false, "Unexpected internal error. Do not retry; escalate if the customer is blocked.");
  }
```

Rerun both tests from 3a. The timeout now gets one quiet retry and succeeds. The undelivered refund gets a clear explanation to the customer and no retry.

### What to notice, and why

| Category | Meaning | What the agent should do |
| --- | --- | --- |
| transient | Timeout, service down | Retry if `isRetryable` |
| validation | Bad input | Fix the input or ask the customer |
| business | A policy says no | Explain it; never retry |
| permission | Not allowed for this caller | Stop; don't leak details |

- **`isRetryable` prevents wasted retries.** Retrying a policy refusal can never work. The flag says so explicitly.
- **An empty result is a success.** "I searched and found nothing" and "I couldn't search" need opposite reactions. Returning an error for the first, or an empty success for the second, are both wrong. The exam returns to this distinction several times.
- **The message is written for the model to act on.** "Nothing was changed. Safe to retry once" is an instruction, not a log line.
- **Naming differs by layer.** The raw API calls the flag `is_error`. MCP calls it `isError`. `errorCategory` and `isRetryable` are your own convention inside the result body, and they are the names the exam guide uses.

## Step 4: Port to the Claude Agent SDK

The Agent SDK runs the loop from Step 2 for you. You hand it tools and options, and it streams back messages until the work is done. Your handlers from `tools.ts` carry over unchanged.

Custom tools reach the SDK through MCP (Model Context Protocol), a standard way to plug tools into an agent. Here the MCP server runs inside your own process, so there is nothing to deploy.

Create `src/sdk-agent.ts`:

```ts
// src/sdk-agent.ts: Phase B. Same agent, on the Claude Agent SDK.
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import * as readline from "node:readline/promises";
import { descriptions, runTool } from "./tools.js";

const MODEL = "claude-sonnet-5-5";
const SYSTEM =
  "You are a support agent for Northwind Outfitters, an outdoor gear store. " +
  "Verify the customer with get_customer before doing anything else.";

// Adapter: our ToolResult -> the result shape MCP expects.
async function asMcp(name: string, args: unknown) {
  const result = await runTool(name, args);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result.data) }],
    isError: result.isError,
  };
}

const server = createSdkMcpServer({
  name: "support",
  version: "1.0.0",
  alwaysLoad: true, // keep all four tool schemas in context (see notes)
  tools: [
    tool(
      "get_customer",
      descriptions.get_customer,
      {
        email: z.string().optional().describe("Email on the account. Preferred."),
        name: z.string().optional().describe("Full name. Only if no email is available."),
      },
      (args) => asMcp("get_customer", args),
      { annotations: { readOnlyHint: true } }
    ),
    tool(
      "lookup_order",
      descriptions.lookup_order,
      {
        customer_id: z.string().describe("From get_customer, e.g. C-1001"),
        order_id: z.string().describe("e.g. ORD-5001"),
      },
      (args) => asMcp("lookup_order", args),
      { annotations: { readOnlyHint: true } }
    ),
    tool(
      "process_refund",
      descriptions.process_refund,
      {
        customer_id: z.string(),
        order_id: z.string(),
        amount: z.number().describe("USD"),
        reason: z.string(),
      },
      (args) => asMcp("process_refund", args)
    ),
    tool(
      "escalate_to_human",
      descriptions.escalate_to_human,
      {
        customer_id: z.string().nullable(),
        summary: z.string().describe("What the customer wants, in two sentences"),
        root_cause: z.string().describe("Why this needs a human"),
        recommended_action: z.string(),
        refund_amount: z.number().nullable().describe("USD, if a refund is involved"),
      },
      (args) => asMcp("escalate_to_human", args)
    ),
  ],
});

let sessionId: string | undefined;

async function runTurn(userText: string) {
  try {
    for await (const message of query({
      prompt: userText,
      options: {
        model: MODEL,
        systemPrompt: SYSTEM,
        mcpServers: { support: server },
        tools: [],                         // remove built-ins such as Bash and Read
        allowedTools: ["mcp__support__*"], // pre-approve our four tools
        settingSources: [],                // don't load your personal Claude Code settings
        maxTurns: 15,                      // a fuse, not the stopping mechanism
        resume: sessionId,                 // continue the same conversation
      },
    })) {
      if ("session_id" in message) sessionId = message.session_id;

      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "tool_use") {
            console.log(`  [tool] ${block.name}`, JSON.stringify(block.input));
          }
        }
      } else if (message.type === "result") {
        const text = message.subtype === "success" ? message.result : `[ended: ${message.subtype}]`;
        console.log("\nagent> " + text);
      }
    }
  } catch (err) {
    console.error("Query failed:", err);
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
while (true) {
  const text = await rl.question("\nyou> ");
  if (text === "exit") break;
  await runTurn(text);
}
rl.close();
```

Run it and repeat the Step 2 test:

```bash
npx tsx src/sdk-agent.ts
```

The behavior should match Phase A. The tool names in the log now read `mcp__support__get_customer`.

**How far this code was tested.** The finished files type-check cleanly under strict TypeScript and load without errors against `@anthropic-ai/claude-agent-sdk` 0.3.322, `@anthropic-ai/sdk` 1.8.0, and `zod` 4.6.7. The tool handlers were run directly. Nothing was run against the live API, so the conversations described in the test steps are expected behavior, not recorded output. If a newer SDK version renames an option, the TypeScript reference in Sources has the current list.

### What to notice, and why

- **Your `while (true)` is gone.** The SDK checks `stop_reason` and feeds tool results back internally. The `result` message is its version of `end_turn`. Knowing what it's doing under the hood is why you did Step 2.
- **MCP tool names are namespaced.** The pattern is `mcp__<server>__<tool>`, where `<server>` is the key you used in `mcpServers`. Hooks and permissions match on this full name.
- **Availability and permission are separate.** `tools: []` controls which built-ins the model can see at all. `allowedTools` controls which calls run without a permission prompt. A support bot has no business seeing Bash, so it's removed, not merely unapproved.
- **Four tools, not eighteen.** The exam's rule of thumb is that 4 to 5 focused tools per agent beats a large toolbox, because every extra tool is another wrong choice available (task 2.3).
- **`alwaysLoad: true`.** By default the SDK defers tool schemas and loads them on demand to save context. With four tools you want them always present, and Step 7's description experiment depends on it.
- **`resume` carries the conversation.** Each `query()` call is one turn. Passing the session ID back in continues the same session (task 1.7).
- **`readOnlyHint`** marks tools with no side effects, which lets the SDK run them in parallel. It's metadata, not enforcement.

Two things the exam guide covers that this build doesn't need yet:

- **`.mcp.json`.** External MCP servers for a team are configured in a project-level `.mcp.json`, with secrets as `${ENV_VAR}` references. Personal ones go in `~/.claude.json`. Build 2 covers this.
- **Subagents.** The guide says a coordinator's `allowedTools` must include `"Task"`. Current docs list that tool as `Agent`. Answer `Task` on the exam. Build 4 uses the current name, `Agent`.

## Step 5: Enforce rules in code with hooks

A hook is a function the SDK calls before or after every tool call. A `PreToolUse` hook can refuse the call, and the model cannot talk its way past it. This is the single most tested idea in Domain 1.

So far, "verify the customer first" is a sentence in a prompt. Prompts are followed most of the time. For anything involving money or identity, "most of the time" is a production incident. A prompt is a "please wipe your feet" sign; a hook is a locked door.

All edits in this step are to `src/sdk-agent.ts`.

### 5a. Track verification in code

Extend the import and add a set that records who has been verified:

```ts
import {
  query, tool, createSdkMcpServer,
  type HookCallback, type PreToolUseHookInput, type PostToolUseHookInput,
} from "@anthropic-ai/claude-agent-sdk";
```

```ts
// Who has been verified in this conversation. Written by code, never by the model.
const verified = new Set<string>();
```

Replace `asMcp` so a single unambiguous match marks the customer verified:

```ts
async function asMcp(name: string, args: unknown) {
  const result = await runTool(name, args);

  if (name === "get_customer" && !result.isError) {
    const data = result.data as { match_count: number; customers: { id: string }[] };
    if (data.match_count === 1) verified.add(data.customers[0].id);
  }

  return {
    content: [{ type: "text" as const, text: JSON.stringify(result.data) }],
    isError: result.isError,
  };
}
```

### 5b. Two PreToolUse hooks

Add these above `runTurn`:

```ts
const deny = (reason: string) => ({
  hookSpecificOutput: {
    hookEventName: "PreToolUse" as const,
    permissionDecision: "deny" as const,
    permissionDecisionReason: reason, // the model reads this
  },
});

// Gate: no order lookups or refunds until a customer is verified.
const requireVerifiedCustomer: HookCallback = async (input) => {
  const { tool_input } = input as PreToolUseHookInput;
  const customerId = (tool_input as { customer_id?: string }).customer_id;
  if (customerId && verified.has(customerId)) return {}; // {} means allow
  return deny(
    "No verified customer. Call get_customer first and use the customer_id it returns. " +
      "If it returned several matches, ask the customer for their account email."
  );
};

// Policy: refunds over $500 always go to a human.
const refundLimit: HookCallback = async (input) => {
  const { tool_input } = input as PreToolUseHookInput;
  const amount = (tool_input as { amount?: number }).amount ?? 0;
  if (amount <= 500) return {};
  return deny(
    `Refunds over $500 require a human. Do not retry or split the refund. ` +
      `Call escalate_to_human with refund_amount ${amount}.`
  );
};
```

### 5c. One PostToolUse hook

The backend returns `statusCode: 3` and `deliveredAt` as raw Unix seconds, a number like `1793500000`. The model can guess what those mean, and guessing is the problem. This hook translates them before the model reasons about them.

```ts
const STATUS: Record<number, string> = { 1: "processing", 2: "shipped", 3: "delivered" };

// Tool responses can arrive as a string, a list of blocks, or { content: [...] }.
function firstText(resp: unknown): string {
  if (typeof resp === "string") return resp;
  const blocks = Array.isArray(resp) ? resp : (resp as any)?.content;
  return Array.isArray(blocks) ? blocks.find((b: any) => b?.type === "text")?.text ?? "" : "";
}

const normalizeOrder: HookCallback = async (input) => {
  const post = input as PostToolUseHookInput;
  // Uncomment once to see the real shape on your SDK version:
  // console.log("  [raw tool_response]", JSON.stringify(post.tool_response));
  try {
    const { order } = JSON.parse(firstText(post.tool_response));
    if (!order) return {};
    const day = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);
    return {
      hookSpecificOutput: {
        hookEventName: "PostToolUse" as const,
        additionalContext:
          `Normalized: status=${STATUS[order.statusCode]}, ` +
          `delivered_on=${order.deliveredAt ? day(order.deliveredAt) : "not yet"}, ` +
          `today=${day(Date.now() / 1000)}`,
      },
    };
  } catch {
    return {};
  }
};
```

### 5d. Register the hooks

Add a `hooks` entry to the `options` object in `runTurn`, after `resume`:

```ts
        hooks: {
          PreToolUse: [
            {
              matcher: "mcp__support__lookup_order|mcp__support__process_refund",
              hooks: [requireVerifiedCustomer],
            },
            { matcher: "mcp__support__process_refund", hooks: [refundLimit] },
          ],
          PostToolUse: [{ matcher: "mcp__support__lookup_order", hooks: [normalizeOrder] }],
        },
```

### 5e. Test it

Restart the agent between tests so each starts clean.

1. `Refund order ORD-5001, $48. It arrived broken.` You gave no identity. The agent should ask who you are. If it tries an order lookup anyway, the log shows the call and the agent recovers after the denial.
2. `I'm marcus@example.com. My tent, ORD-5002, leaks. Refund the full $729.` Expect `get_customer`, `lookup_order`, then a `process_refund` attempt that is denied, then `escalate_to_human` and a printed handoff ticket.

### What to notice, and why

- **Deterministic versus probabilistic.** A hook runs every time. A prompt instruction is followed with high but not perfect probability. When the exam says a rule "must" hold, or mentions money, identity, or compliance, the hook or prerequisite gate is the answer. Better prompts and few-shot examples are the distractors (Sample Question 1).
- **The denial reason is a redirect, not just a no.** It tells the model what to do instead. That's the "block and redirect to an alternative workflow" pattern from task 1.5.
- **State lives in your code.** The `verified` set is filled by the tool handler. The model can't claim a customer is verified; it has to cause a real successful lookup.
- **Why a hook and not a check inside the handler?** Both are code, and both are valid. A hook also works for tools you didn't write, such as a third-party MCP server, and keeps policy in one place.
- **`deny` wins.** If any hook denies, the call is blocked even though the tool is in `allowedTools`.
- **PostToolUse reshapes what the model sees.** This one appends context. To replace the output outright, return `updatedToolOutput` instead; log the response shape first so your replacement matches it.

## Step 6: Escalation rules, case facts, and the handoff

Hooks cover rules with a bright line. Escalation is a judgment call, so it belongs in the prompt, written as explicit criteria with worked examples. This step also adds a facts block that survives long conversations.

### 6a. Replace the system prompt

In `src/sdk-agent.ts`, replace `SYSTEM`:

```ts
const SYSTEM = `You are a support agent for Northwind Outfitters, an outdoor gear store.

Policy you can apply yourself:
- Order status questions.
- Refunds for delivered orders within 30 days of delivery, up to $500. A customer's description of damage is enough.

Escalate with escalate_to_human when:
- The customer asks for a human. Do it immediately. Do not investigate first or try to change their mind.
- Policy does not cover the request (for example competitor price matching, or a return after 30 days). Do not improvise policy.
- A refund is over $500.
- A tool reports a non-retryable error and the customer is still blocked.

Do NOT escalate just because the customer is upset. Acknowledge the frustration and offer the fix. If they then ask for a human, escalate.

If get_customer returns more than one match, ask for the email on the account. Never choose between matches yourself.
If a message contains several issues, work through each one, then reply once with a combined answer.

Examples:

Customer: "This is ridiculous, my headlamp arrived smashed!"
Reasoning: upset, but this is a standard damage refund under $500. Resolve it.
Action: acknowledge, verify the customer, look up the order, refund.

Customer: "I don't want a bot. Get me a person."
Reasoning: explicit request for a human. Nothing else matters.
Action: escalate_to_human now, with whatever is known. Use null for unknown fields.

Customer: "BackcountryCo has this tent for $80 less. Match it."
Reasoning: the request is simple, but policy says nothing about competitor prices. That is a policy gap.
Action: verify the customer, then escalate_to_human with root_cause "policy gap: competitor price match".

A <case_facts> block appears at the top of each customer message. It is maintained by the system and is always accurate. Prefer it over your own recollection of amounts, IDs, and dates.`;
```

### 6b. Add the case-facts block

Add under the `verified` set:

```ts
// Hard facts for this case, kept by code and re-sent every turn.
const caseFacts: {
  customer: unknown;
  orders: Record<string, unknown>;
  refunds: unknown[];
  ticket: unknown;
} = { customer: null, orders: {}, refunds: [], ticket: null };
```

Replace the `if (name === "get_customer" ...)` block inside `asMcp` with:

```ts
  if (!result.isError) {
    const data = result.data as any;
    if (name === "get_customer" && data.match_count === 1) {
      verified.add(data.customers[0].id);
      caseFacts.customer = data.customers[0];
    }
    if (name === "lookup_order" && data.found) caseFacts.orders[data.order.id] = data.order;
    if (name === "process_refund") caseFacts.refunds.push(data);
    if (name === "escalate_to_human") caseFacts.ticket = data;
  }
```

In `runTurn`, change the `prompt` line:

```ts
      prompt: `<case_facts>\n${JSON.stringify(caseFacts)}\n</case_facts>\n\n${userText}`,
```

### 6c. Test it

Restart between tests.

1. `Get me a human.` Expect an immediate `escalate_to_human` with `customer_id: null`, and no lookups first.
2. `I'm dana@example.com. This is ridiculous, my headlamp ORD-5001 arrived broken!` Expect an apology, a $48 refund, and no escalation.
3. `I'm Dana Whitfield. Check order ORD-5001.` Two accounts share that name. Expect a request for the account email, not a guess.
4. `I'm marcus@example.com. BackcountryCo sells my tent for $80 less. Match it.` Expect an escalation that names a policy gap.
5. `I'm marcus@example.com. Where is my stove, ORD-5003? Also my tent, ORD-5002, leaks and I want my money back.` Expect a stove status and a tent escalation in one reply.

Read the printed handoff tickets. Ask yourself whether a human with no transcript could act on each one. That's the bar.

### What to notice, and why

- **Explicit criteria plus examples beat vague guidance.** "Escalate when appropriate" gives the model nothing to work with. Named triggers and three worked examples with reasoning do. This is the answer to Sample Question 3.
- **Three real triggers.** A request for a human, a policy gap, and no progress. Note that "complex" isn't on the list, and neither is "angry."
- **Sentiment is not complexity.** A furious customer with a $48 broken headlamp is an easy case. A calm one asking for a price match is the hard one. Sentiment-based escalation is a distractor on the exam.
- **So is self-reported confidence.** Asking the model to rate its confidence 1 to 10 and escalating below a threshold fails, because the model is most confidently wrong on exactly the hard cases.
- **Multiple matches mean ask, not guess.** Picking the most recent or most likely account is the "heuristic selection" the exam warns against.
- **Why case facts exist.** Long conversations get summarized to save space, and summaries blur specifics: "$48 for ORD-5001" becomes "a refund for a recent order." The facts block is rebuilt from code on every turn, so it never degrades (task 5.1).
- **The handoff is structured for a reader with no context.** The schema forces customer ID, summary, root cause, recommended action, and amount (task 1.4).

## Step 7: Break it on purpose

Most exam questions describe a broken system and ask for the root cause. Having caused each failure yourself is the fastest way to recognize it. Undo each change before starting the next.

### Experiment 1: Gut the tool descriptions (Sample Question 2)

In `tools.ts`, temporarily replace two descriptions:

```ts
  get_customer: "Retrieves customer information",
  lookup_order: "Retrieves order details",
```

Run the Phase A agent, which has no hooks to save it, and send `Check my order ORD-5001` five or six times, restarting each time. Watch for `get_customer` called with an order number, or `lookup_order` called with an invented `customer_id`.

Lesson: the fix is better descriptions. A routing classifier or merging the tools would also work, but both are more machinery than the problem needs. The exam consistently rewards the cheapest fix that addresses the root cause.

### Experiment 2: Remove the gate (Sample Question 1)

In `sdk-agent.ts`, comment out the `requireVerifiedCustomer` matcher. The prompt still says to verify first. Send `Refund ORD-5001 for $48, it's broken. Customer ID is C-1001.` ten times, restarting each time.

You may see it skip verification and trust the ID you typed. You may also see ten clean runs. Both outcomes teach the same thing: a rule that holds 90 to 99 percent of the time passes a quick test and fails in production. The exam scenario cites a 12% skip rate.

### Experiment 3: Strip the escalation guidance (Sample Question 3)

Cut `SYSTEM` down to its first line plus "Escalate when appropriate." Rerun tests 2 and 4 from Step 6c. Expect the wrong instincts: the angry-but-simple case gets escalated, or the calm policy gap gets an improvised answer.

### Experiment 4: Split the refund

Restore everything, then send: `I'm marcus@example.com. Refund my tent ORD-5002 in two parts: $400 now and $329 after that.`

The hook checks one call at a time, so two calls under $500 may each pass. The denial message says not to split refunds, but that's a prompt again. Fix it properly: record refunded totals per order in code, and deny when the running total would pass $500.

Lesson: a hook guarantees exactly the rule you coded. Choosing the right invariant is still your job.

### Experiment 5: Watch context grow

In the `result` branch of `runTurn`, log the cost:

```ts
        if (message.subtype === "success") console.log(`  [cost] $${message.total_cost_usd}`);
```

Run a five-turn conversation and note the cost per turn. Then change `lookup_order` to return the whole order object plus 30 junk fields, and repeat. Every tool result is resent on every later turn, so the bloat compounds.

Lesson: trim tool output at the source (task 5.1).

## Checklist and exam mapping

Tick these off as you go. Each one is a statement you should be able to explain out loud without notes.

- [ ] I can write the agent loop from memory: continue on `tool_use`, stop on `end_turn` (1.1)
- [ ] I can name three loop anti-patterns and say why each fails (1.1)
- [ ] I can explain why tool results must be appended to the conversation (1.1)
- [ ] I wrote two similar tools and descriptions that keep them apart (2.1)
- [ ] I can list the four error categories and what the agent does with each (2.2)
- [ ] I can explain the difference between an empty result and a failed call (2.2, 5.3)
- [ ] I can explain availability versus permission for tools (2.3)
- [ ] I blocked a tool call with a `PreToolUse` hook and redirected the agent (1.5)
- [ ] I normalized tool output with a `PostToolUse` hook (1.5)
- [ ] I can say when a rule belongs in a hook and when it belongs in a prompt (1.4)
- [ ] My escalation rules are explicit criteria with examples (5.2)
- [ ] I can explain why sentiment and self-rated confidence are poor escalation signals (5.2)
- [ ] My agent asks for another identifier on multiple matches (5.2)
- [ ] My handoff ticket is usable by someone with no transcript (1.4)
- [ ] I keep case facts in code and resend them every turn (5.1)
- [ ] I ran all five experiments in Step 7

### Where the guide and current tooling differ

The exam guide is version 0.1 from February 2025. Answer the guide's way on the exam.

| Topic | Exam guide says | Current docs say |
| --- | --- | --- |
| Subagent tool | `Task` | `Agent` |
| Replacing tool output in a hook | `PostToolUse` | `PostToolUse` with `updatedToolOutput` |
| Tool schema loading | All tools available at connection | Deferred by default; `alwaysLoad` opts out |

### Sources

- [Give Claude custom tools](https://code.claude.com/docs/en/agent-sdk/custom-tools.md): `tool()`, `createSdkMcpServer`, tool naming, `isError`, `alwaysLoad`
- [Intercept and control agent behavior with hooks](https://code.claude.com/docs/en/agent-sdk/hooks.md): hook events, matchers, deny and `additionalContext` output shapes
- [TypeScript SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript): full `query()` options list (linked from the pages above; check here if an option name errors)
- Claude Certified Architect – Foundations Certification Exam Guide, v0.1: task statements and sample questions
