import { NextRequest, NextResponse } from "next/server";
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
 * Daily autopilot: mine → verify → draft → agent-queue for enabled users.
 * Sending still happens on /api/cron/outreach during professor-local windows.
 */
export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 8, 15);
  const result = await runDailyAutopilot(limit, { force: true, tickRounds: 15 });

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    ...result,
    note:
      "Autopilot fills the pipeline. Live sends still require DRIP_DRY_RUN=false, connected inbox, and agent_gate/auto approval mode for auto-queue.",
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
