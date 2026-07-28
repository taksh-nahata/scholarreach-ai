/**
 * CLI dry-run for academic drip dispatcher physics.
 * Usage: npx tsx scripts/drip_dry_run.ts
 */
import "dotenv/config";
import { EnterpriseDripDispatcher } from "../src/services/drip_dispatcher";

const dispatcher = new EnterpriseDripDispatcher();
const now = new Date();
const physics = dispatcher.simulateWindowPhysics(15);
const next = dispatcher.getNextAcademicWindowSlot(now);

console.log("=== ScholarReach AI — Drip Dispatcher Dry Run ===\n");
console.log(`Now: ${now.toString()}`);
console.log(`In academic window (Tue–Thu 8–9 AM)? ${dispatcher.isAcademicWindow(now)}`);
console.log(`Next window: ${dispatcher.formatSlot(next)} (${next.toISOString()})`);
console.log(`\nPhysics:`);
console.log(`  Delay jitter: ${physics.minDelayMs / 1000}–${physics.maxDelayMs / 1000}s`);
console.log(`  Est. emails/hour: ~${physics.estimatedEmailsPerHour}`);
console.log(`  Daily cap: ${physics.dailyCap}`);
console.log(`  Fits 60-min window target (~500)? ${physics.fitsIn60MinWindow}`);
console.log(`\nSample jitter sequence:`);
for (const s of physics.samples) {
  console.log(
    `  #${String(s.index).padStart(2, "0")}  delay=${s.delaySec}s  cumulative=${s.cumulativeSec}s`
  );
}

const ok =
  physics.samples.every((s) => s.delaySec >= 5 && s.delaySec <= 9) &&
  physics.estimatedEmailsPerHour >= 400;

console.log(`\n${ok ? "✅ PASS" : "❌ FAIL"} — drip physics assertions`);
process.exit(ok ? 0 : 1);
