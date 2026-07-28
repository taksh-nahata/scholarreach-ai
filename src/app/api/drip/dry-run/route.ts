import { NextResponse } from "next/server";
import { dripDispatcher } from "@/services/drip_dispatcher";

/** Dry-run verification of 8–9 AM high-speed drip physics (no private data). */
export async function GET() {
  // Keep physics-only; never expose user queues here
  const now = new Date();
  const physics = dripDispatcher.simulateWindowPhysics(12);
  const nextSlot = dripDispatcher.getNextAcademicWindowSlot(now);

  return NextResponse.json({
    ok: true,
    dryRun: process.env.DRIP_DRY_RUN !== "false",
    freeTier: {
      hosting: "Vercel Hobby + Neon free",
      studentAccounts: "free forever",
      liveSend: process.env.DRIP_DRY_RUN === "false" ? "enabled" : "dry-run (safe)",
    },
    now: now.toISOString(),
    inAcademicWindow: dripDispatcher.isAcademicWindow(now),
    nextAcademicWindow: {
      iso: nextSlot.toISOString(),
      label: dripDispatcher.formatSlot(nextSlot),
    },
    physics,
    assertion: {
      jitterBetween5And9s: physics.samples.every(
        (s) => s.delaySec >= 5 && s.delaySec <= 9
      ),
      targetsApprox500PerHour: physics.estimatedEmailsPerHour >= 400,
      dailyCap: physics.dailyCap,
    },
  });
}
