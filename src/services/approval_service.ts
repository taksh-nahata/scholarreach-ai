/**
 * Shared approve → schedule path used by human UI and auto-approve agent.
 */
import { prisma } from "@/lib/prisma";
import { dripDispatcher } from "@/services/drip_dispatcher";
import {
  isSyntacticallyValidRecipient,
  normalizeEmail,
  strictDeliverabilityEnabled,
} from "@/services/deliverability_guard";
import { emailConfidenceTier } from "@/services/email_confidence";

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
  if (!isSyntacticallyValidRecipient(toEmail)) {
    throw new Error("Recipient email is invalid. Re-verify in Directory.");
  }

  const profEmail = normalizeEmail(draft.professor?.email || "");
  const toLower = normalizeEmail(toEmail);
  const looksLikeUnverifiedProfessor =
    !!draft.professor &&
    !draft.professor.emailVerified &&
    (!profEmail || toLower === profEmail);
  if (looksLikeUnverifiedProfessor) {
    throw new Error(
      "Professor email is not verified. Re-check in Directory or set a different To: address."
    );
  }
  if (strictDeliverabilityEnabled()) {
    if (!draft.professor) {
      throw new Error(
        "Strict deliverability mode: draft must be linked to a professor."
      );
    }
    if (!draft.professor.emailVerified || !profEmail) {
      throw new Error(
        "Strict deliverability mode: only verified professor emails can be queued."
      );
    }
    if (toLower !== profEmail) {
      throw new Error(
        "Strict deliverability mode: recipient must match the verified professor email."
      );
    }
  }
  if (draft.professor) {
    const confidence = emailConfidenceTier({
      email: toLower,
      name: draft.professor.name,
      university: draft.professor.university,
      homepageUrl: draft.professor.homepageUrl,
    });
    if (confidence.tier === "low") {
      throw new Error(
        "Recipient confidence is low. Re-verify in Directory before queuing."
      );
    }
  }

  const university = draft.professor?.university || null;
  const slot = dripDispatcher.isAcademicWindow(new Date(), university)
    ? new Date()
    : dripDispatcher.getNextAcademicWindowSlot(new Date(), university);

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
        university,
        toEmail: toEmail.toLowerCase(),
        ccEmails:
          opts.ccEmails || draft.ccEmails || draft.professor?.ccEmails || null,
        subject: draft.subject,
        body: draft.body,
        htmlBody: draft.htmlBody,
        scheduledIso: slot,
        scheduledTime: dripDispatcher.formatSlot(slot, university),
        status: "scheduled",
        kind: "outreach",
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
