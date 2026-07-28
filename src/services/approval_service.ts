/**
 * Shared approve → schedule path used by human UI and auto-approve agent.
 */
import { prisma } from "@/lib/prisma";
import { dripDispatcher } from "@/services/drip_dispatcher";

export async function approveDraftToQueue(opts: {
  userId: string;
  draftId: string;
  ccEmails?: string | null;
  specialNotes?: string | null;
  via?: "human" | "agent";
}) {
  const draft = await prisma.draft.findFirst({
    where: { id: opts.draftId, userId: opts.userId },
    include: { professor: true },
  });
  if (!draft) throw new Error("Draft not found");

  const toEmail = draft.recipientEmail || draft.professor?.email || "";
  if (!toEmail) throw new Error("No recipient email on draft");

  const slot = dripDispatcher.isAcademicWindow()
    ? new Date()
    : dripDispatcher.getNextAcademicWindowSlot();

  const reviewTag =
    opts.via === "agent"
      ? `[agent-approved] ${opts.specialNotes || ""}`.trim()
      : opts.specialNotes || draft.specialNotes;

  const [scheduled] = await prisma.$transaction([
    prisma.scheduledEmail.create({
      data: {
        userId: opts.userId,
        professorId: draft.professorId,
        professorName: draft.professor?.name || null,
        university: draft.professor?.university || null,
        toEmail: toEmail.toLowerCase(),
        ccEmails:
          opts.ccEmails || draft.ccEmails || draft.professor?.ccEmails || null,
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
        ccEmails: opts.ccEmails || draft.ccEmails,
        specialNotes: reviewTag,
        reviewStatus: opts.via === "agent" ? "agent_approved" : "human_approved",
      },
    }),
  ]);

  return {
    scheduledId: scheduled.id,
    scheduledTime: scheduled.scheduledTime,
    status: "scheduled" as const,
  };
}

export async function countHumanApprovals(userId: string) {
  return prisma.draft.count({
    where: {
      userId,
      OR: [
        { reviewStatus: "human_approved" },
        {
          AND: [
            { status: { in: ["scheduled", "approved", "sent"] } },
            { NOT: { reviewStatus: "agent_approved" } },
          ],
        },
      ],
    },
  });
}
