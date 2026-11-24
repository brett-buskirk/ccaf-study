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
