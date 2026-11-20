// src/tools.ts
import type Anthropic from "@anthropic-ai/sdk";
import { findCustomers, getOrder, issueRefund, createTicket, TimeoutError } from "./backend.js";

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

type ErrorCategory = "transient" | "validation" | "business" | "permission";

const fail = (errorCategory: ErrorCategory, isRetryable: boolean, message: string): ToolResult => ({
  isError: true,
  data: { errorCategory, isRetryable, message },
});

const handlers: Record<string, (input: any) => Promise<ToolResult>> = {
  async get_customer({ email, name }) {
    const matches = findCustomers({ email, name });
    return ok({ match_count: matches.length, customers: matches });
  },

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

  async escalate_to_human(input) {
    return ok(createTicket(input));
  },
};

export async function runTool(name: string, input: any): Promise<ToolResult> {
  const handler = handlers[name];
  if (!handler) return { isError: true, data: `Unknown tool: ${name}` };
  try {
    return await handler(input);
  } catch (err) {
    if (err instanceof TimeoutError) {
      return fail("transient", true, "The order service timed out. Nothing was changed. Safe to retry once.");
    }
    return fail("transient", false, "Unexpected internal error. Do not retry; escalate if the customer is blocked.");
  }
}
