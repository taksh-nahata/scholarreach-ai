import { NextRequest, NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import {
  cancelJob,
  getActiveJobs,
  startApprovalSweepJob,
  startDraftGenerateJob,
  startEmailReverifyJob,
  startMineLeadsJob,
  tickApprovalSweepJob,
  tickDraftGenerateJob,
  tickEmailReverifyJob,
  tickMineLeadsJob,
  tickUserJobs,
} from "@/services/background_jobs";

export const maxDuration = 60;

export async function GET() {
  return withAuthUser(async (user) => {
    const jobs = await getActiveJobs(user.id);
    return NextResponse.json({ jobs });
  });
}

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "status");

    if (action === "cancel" && body.jobId) {
      await cancelJob(user.id, String(body.jobId));
      return NextResponse.json({ ok: true, jobs: await getActiveJobs(user.id) });
    }

    if (action === "start_reverify") {
      const professorIds = Array.isArray(body.professorIds)
        ? body.professorIds.map(String)
        : undefined;
      const job = await startEmailReverifyJob(user.id, {
        all: body.all !== false,
        professorIds,
      });
      const ticked = (await tickEmailReverifyJob(user.id, 15)) || job;
      return NextResponse.json({ ok: true, job: ticked });
    }

    if (action === "start_mine") {
      const job = await startMineLeadsJob(user.id, Number(body.count) || 20);
      const ticked = (await tickMineLeadsJob(user.id, 2)) || job;
      return NextResponse.json({ ok: true, job: ticked });
    }

    if (action === "start_draft") {
      const ids = Array.isArray(body.professorIds)
        ? body.professorIds.map(String)
        : [];
      const job = await startDraftGenerateJob(user.id, ids);
      const ticked = (await tickDraftGenerateJob(user.id, 1)) || job;
      return NextResponse.json({ ok: true, job: ticked });
    }

    if (action === "start_sweep") {
      const job = await startApprovalSweepJob(user.id);
      const ticked = (await tickApprovalSweepJob(user.id, 3)) || job;
      return NextResponse.json({ ok: true, job: ticked });
    }

    if (action === "tick") {
      const ticked = await tickUserJobs(user.id);
      return NextResponse.json({
        ok: true,
        job: ticked[0] || null,
        jobs: await getActiveJobs(user.id),
      });
    }

    return NextResponse.json({ jobs: await getActiveJobs(user.id) });
  });
}
