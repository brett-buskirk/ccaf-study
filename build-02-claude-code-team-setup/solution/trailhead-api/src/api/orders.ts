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
