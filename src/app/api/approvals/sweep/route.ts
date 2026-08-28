import { NextRequest, NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import { sweepPendingApprovals } from "@/services/pending_approvals_sweep";

export const maxDuration = 60;

/**
 * One-shot chunk for pending-approvals sweep.
 * Prefer /api/jobs action=start_sweep for background progress that survives tab switches.
 */
export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 3, 6);
    const verifyEmails = body.verifyEmails !== false;
    const applyGate = body.applyGate !== false;

    const result = await sweepPendingApprovals(user.id, {
      limit,
      verifyEmails,
      applyGate,
    });

    const queued = result.gate.filter((g) => g.action === "queued").length;
    const emailFixed = result.emailChecks.filter((e) => e.emailVerified).length;

    return NextResponse.json({
      ok: true,
      ...result,
      summary: {
        checked: result.emailChecks.length,
        emailVerified: emailFixed,
        queued,
        remaining: result.remaining,
        processed: result.processed,
      },
    });
  });
}
