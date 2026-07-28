import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuthUser } from "@/lib/api-auth";
import { approveDraftToQueue } from "@/services/approval_service";
import { reviewDraftAsStudent } from "@/services/draft_reviewer";

export async function GET(req: NextRequest) {
  return withAuthUser(async (user) => {
    const status = new URL(req.url).searchParams.get("status") || "pending";
    const statusFilter =
      status === "pending"
        ? { in: ["pending", "pending_review"] }
        : status;

    const drafts = await prisma.draft.findMany({
      where: { userId: user.id, status: statusFilter },
      include: { professor: true },
      orderBy: [{ matchScore: "desc" }, { updatedAt: "desc" }],
    });

    return NextResponse.json({ drafts, count: drafts.length });
  });
}

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json();
    const { draftId, action, ccEmails, specialNotes } = body as {
      draftId: string;
      action: "approve" | "reject" | "agent_review";
      ccEmails?: string;
      specialNotes?: string;
    };

    const draft = await prisma.draft.findFirst({
      where: { id: draftId, userId: user.id },
    });
    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    if (action === "agent_review") {
      const verdict = await reviewDraftAsStudent({
        userId: user.id,
        draftId: draft.id,
      });
      await prisma.draft.update({
        where: { id: draft.id },
        data: {
          reviewStatus: verdict.approve ? "agent_approved" : "agent_rejected",
          reviewNotes: `${verdict.notes} (score ${verdict.score})`,
          matchScore: verdict.score,
        },
      });
      if (verdict.approve && body.autoSchedule) {
        const scheduled = await approveDraftToQueue({
          userId: user.id,
          draftId: draft.id,
          via: "agent",
          specialNotes: verdict.notes,
        });
        return NextResponse.json({ ok: true, verdict, ...scheduled });
      }
      return NextResponse.json({ ok: true, verdict });
    }

    if (action === "reject") {
      await prisma.draft.update({
        where: { id: draft.id },
        data: {
          status: "rejected",
          ccEmails: ccEmails || draft.ccEmails,
          specialNotes,
          reviewStatus: "human_rejected",
        },
      });
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    try {
      const scheduled = await approveDraftToQueue({
        userId: user.id,
        draftId: draft.id,
        ccEmails,
        specialNotes,
        via: "human",
      });
      return NextResponse.json({ ok: true, ...scheduled });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Approve failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
