import { NextRequest, NextResponse } from "next/server";
import { tickAllRunningJobs } from "@/services/background_jobs";
import { syncRepliesForAllConnectedUsers } from "@/services/reply_tracker";
import { scheduleFollowUpsForAllUsers } from "@/services/follow_up_scheduler";
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
 * Daily: sync replies, queue follow-ups, and advance stuck background jobs.
 */
export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userLimit = Number(process.env.CRON_REPLY_USER_LIMIT || 15);
  const jobTicks = await tickAllRunningJobs(15);
  const autopilot = await runDailyAutopilot(5, { force: true, tickRounds: 10 });
  const replies = await syncRepliesForAllConnectedUsers(userLimit);
  const followUps = await scheduleFollowUpsForAllUsers();

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    autopilot,
    jobTicks,    replies,
    followUps,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
