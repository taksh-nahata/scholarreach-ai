import { NextRequest, NextResponse } from "next/server";
import { tickAllRunningJobs } from "@/services/background_jobs";
import { dripDispatcher } from "@/services/drip_dispatcher";
import {
  assessOutreachHealth,
  selfHealOutreach,
} from "@/services/outreach_health";
import { runDailyAutopilot } from "@/services/outreach_autopilot";
export const maxDuration = 60;

function authorize(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const q = req.nextUrl.searchParams.get("secret") || "";
  return bearer === secret || q === secret;
}

/**
 * Flush due drip emails only (small batch for Vercel Hobby).
 * Reply sync + follow-ups run on /api/cron/followups.
 */
export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobTicks = await tickAllRunningJobs(15);
  const autopilot = await runDailyAutopilot(5, { tickRounds: 12 });
  const before = await assessOutreachHealth();  // Prefer in-window sends; self-heal rolls overdue out-of-window items
  const heal = await selfHealOutreach({ limit: 12 });
  let drip = heal.results;
  // Extra flush only when some professor TZ is currently in window
  if (dripDispatcher.isLiveSend() && dripDispatcher.isAnyAcademicWindow()) {
    const batchLimit = Number(process.env.CRON_DRIP_BATCH || 10);
    drip = await dripDispatcher.processDueBatch(batchLimit);
  }
  const after = await assessOutreachHealth();

  return NextResponse.json({
    ok: after.ok,
    at: new Date().toISOString(),
    dryRun: after.dryRun,
    liveSend: after.liveSend,
    timeZone: after.timeZone,
    note: "Sends items already scheduled for professor-local mornings when due. Reply sync is on /api/cron/followups.",
    health: { before, after, actions: heal.actions },
    autopilot,
    jobTicks,    drip,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
