// Step 6e: append this to src/api/orders.ts on the risky-change branch.
// It contains a SQL injection, a crash on a missing order, and one style nit.

export function findOrdersSql(customerName: string): string {
  let query = "SELECT * FROM orders WHERE customer = '" + customerName + "'";
  return query;
}

export function refundAmount(id: string, percent: number): number {
  const order = getOrder(id);
  return order!.total * percent;
}
