// src/sdk-agent.ts: Phase B. Same agent, on the Claude Agent SDK.
import {
  query, tool, createSdkMcpServer,
  type HookCallback, type PreToolUseHookInput, type PostToolUseHookInput,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import * as readline from "node:readline/promises";
import { descriptions, runTool } from "./tools.js";

const MODEL = "claude-sonnet-5-5";
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

// Who has been verified in this conversation. Written by code, never by the model.
const verified = new Set<string>();

// Hard facts for this case, kept by code and re-sent every turn.
const caseFacts: {
  customer: unknown;
  orders: Record<string, unknown>;
  refunds: unknown[];
  ticket: unknown;
} = { customer: null, orders: {}, refunds: [], ticket: null };

// Adapter: our ToolResult -> the result shape MCP expects.
async function asMcp(name: string, args: unknown) {
  const result = await runTool(name, args);

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

let sessionId: string | undefined;

async function runTurn(userText: string) {
  try {
    for await (const message of query({
      prompt: `<case_facts>\n${JSON.stringify(caseFacts)}\n</case_facts>\n\n${userText}`,
      options: {
        model: MODEL,
        systemPrompt: SYSTEM,
        mcpServers: { support: server },
        tools: [],                         // remove built-ins such as Bash and Read
        allowedTools: ["mcp__support__*"], // pre-approve our four tools
        settingSources: [],                // don't load your personal Claude Code settings
        maxTurns: 15,                      // a fuse, not the stopping mechanism
        resume: sessionId,                 // continue the same conversation
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
