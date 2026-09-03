/**
 * Outreach dedup guard tests (logic-only; no DB).
 * Run: npx tsx tests/outreach_guard.test.ts
 */
import assert from "node:assert/strict";
import {
  ACTIVE_QUEUE_STATUSES,
  BLOCKING_DRAFT_STATUSES,
} from "../src/services/outreach_guard";

console.log("\n== outreach guard constants");
{
  assert.ok(ACTIVE_QUEUE_STATUSES.includes("scheduled"));
  assert.ok(ACTIVE_QUEUE_STATUSES.includes("sending"));
  assert.ok(BLOCKING_DRAFT_STATUSES.includes("scheduled"));
  assert.ok(!BLOCKING_DRAFT_STATUSES.includes("rejected"));
}

console.log("\nAll outreach_guard tests passed.");
