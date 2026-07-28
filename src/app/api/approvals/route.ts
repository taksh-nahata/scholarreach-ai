import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { dripDispatcher } from "@/services/drip_dispatcher";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const status = new URL(req.url).searchParams.get("status") || "pending";
  const statusFilter =
    status === "pending"
      ? { in: ["pending", "pending_review"] }
      : status;

  const drafts = await prisma.draft.findMany({
    where: { userId: user.id, status: statusFilter },
    include: { professor: true },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ drafts, count: drafts.length });
}

/** Instant approval (~10ms UI response; queue sync in background) */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  const body = await req.json();
  const { draftId, action, ccEmails, specialNotes } = body as {
    draftId: string;
    action: "approve" | "reject";
    ccEmails?: string;
    specialNotes?: string;
  };

  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId: user.id },
    include: { professor: true },
  });
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  if (action === "reject") {
    await prisma.draft.update({
      where: { id: draft.id },
      data: { status: "rejected", ccEmails: ccEmails || draft.ccEmails, specialNotes },
    });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // Instant approve + enqueue
  const slot = dripDispatcher.isAcademicWindow()
    ? new Date()
    : dripDispatcher.getNextAcademicWindowSlot();

  const toEmail =
    draft.recipientEmail ||
    draft.professor?.email ||
    "";

  if (!toEmail) {
    return NextResponse.json({ error: "No recipient email on draft" }, { status: 400 });
  }

  const [scheduled] = await prisma.$transaction([
    prisma.scheduledEmail.create({
      data: {
        userId: user.id,
        professorId: draft.professorId,
        professorName: draft.professor?.name || null,
        university: draft.professor?.university || null,
        toEmail: toEmail.toLowerCase(),
        ccEmails: ccEmails || draft.ccEmails || draft.professor?.ccEmails || null,
        subject: draft.subject,
        body: draft.body,
        htmlBody: draft.htmlBody,
        scheduledIso: slot,
        scheduledTime: dripDispatcher.formatSlot(slot),
        status: "scheduled",
      },
    }),
    prisma.draft.update({
      where: { id: draft.id },
      data: {
        status: "scheduled",
        ccEmails: ccEmails || draft.ccEmails,
        specialNotes,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    status: "scheduled",
    scheduledId: scheduled.id,
    scheduledTime: scheduled.scheduledTime,
  });
}
