import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "./money.js";

test("formats whole dollars", () => {
  assert.equal(formatMoney(48), "$48.00");
});
