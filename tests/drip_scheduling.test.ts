/**
 * Drip scheduling grace-window + roll logic.
 * Run: npx tsx tests/drip_scheduling.test.ts
 */
import assert from "node:assert/strict";
import { dripDispatcher } from "../src/services/drip_dispatcher";

// Tuesday Sep 2, 2025 (EDT, UTC-4)
const tue930Et = new Date("2025-09-02T13:30:00.000Z");
const tue1115Et = new Date("2025-09-02T15:15:00.000Z");
const tue5amPt = new Date("2025-09-02T12:00:00.000Z"); // 8:00 ET / 5:00 PT
const tue8amEt = new Date("2025-09-02T12:00:00.000Z");

console.log("\n== canDispatchNow grace window");
{
  assert.equal(
    dripDispatcher.canDispatchNow(tue930Et, "MIT"),
    true,
    "9:30 AM ET should still dispatch (grace)"
  );
  assert.equal(
    dripDispatcher.canDispatchNow(tue1115Et, "MIT"),
    false,
    "11:15 AM ET is past grace"
  );
  assert.equal(
    dripDispatcher.canDispatchNow(tue5amPt, "Stanford University"),
    false,
    "5:00 AM PT should wait for local 8 AM"
  );
}

console.log("\n== getNextAcademicWindowSlot same-morning grace");
{
  const slot = dripDispatcher.getNextAcademicWindowSlot(tue930Et, "MIT");
  const deltaMin = (slot.getTime() - tue930Et.getTime()) / 60_000;
  assert.ok(deltaMin >= 0 && deltaMin < 15, `expected soon slot, got +${deltaMin}m`);

  const pastGrace = dripDispatcher.getNextAcademicWindowSlot(
    tue1115Et,
    "MIT"
  );
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(pastGrace);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  assert.notEqual(weekday, "Tue", "past grace should roll to next Tue–Thu");
}

console.log("\n== shouldRollMissedSlot");
{
  const scheduled = tue8amEt;
  assert.equal(
    dripDispatcher.shouldRollMissedSlot(tue5amPt, scheduled, "Stanford University"),
    false,
    "do not roll West Coast before local window opens"
  );
  assert.equal(
    dripDispatcher.shouldRollMissedSlot(tue1115Et, scheduled, "MIT"),
    true,
    "roll after grace expires same day"
  );
  assert.equal(
    dripDispatcher.shouldRollMissedSlot(tue930Et, scheduled, "MIT"),
    false,
    "no roll while still in grace"
  );
}

console.log("\n== isAnyAcademicWindow US-only at night PT");
{
  // Wed Sep 2 2026 20:34 PT = Thu Sep 3 03:34 UTC — India morning exists,
  // but US academic window must report false.
  const nightPt = new Date("2026-09-03T03:34:00.000Z");
  assert.equal(
    dripDispatcher.isAnyAcademicWindow(nightPt),
    false,
    "US window must be closed at 8:34 PM PT"
  );
}

console.log("\nAll drip scheduling tests passed.");
