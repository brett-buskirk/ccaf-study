import { test } from "node:test";
import assert from "node:assert/strict";
import { refundSummary } from "./orders.js";

test("summarizes a refund", () => {
  assert.equal(refundSummary("ORD-5001"), "Refund $48.00 for ORD-5001");
});
