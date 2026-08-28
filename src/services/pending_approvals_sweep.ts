/**
 * Backfill: verify professor emails on pending drafts + apply agent/auto gate.
 */
import { prisma } from "@/lib/prisma";
import { PENDING_APPROVAL_STATUSES } from "@/lib/draft_status";
import { applyFacultyEmailCheck } from "@/services/faculty_email_apply";
import { isJunkFacultyEmail } from "@/services/faculty_email_verifier";
import { reviewDraftAsStudent } from "@/services/draft_reviewer";
import { approveDraftToQueue } from "@/services/approval_service";
import { countHumanApprovals } from "@/services/approval_service";

export type SweepResult = {
  emailChecks: Array<{
    draftId: string;
    professorName: string;
    email: string | null;
    emailVerified: boolean;
    changed: boolean;
    notes: string;
  }>;
  gate: Array<{
    draftId: string;
    action: "queued" | "rejected" | "skipped" | "awaiting_human";
    notes: string;
  }>;
  remaining: number;
  processed: number;
};

async function reverifyProfessorForDraft(
  userId: string,
  professorId: string | null | undefined
) {
  if (!professorId) return null;
  const professor = await prisma.professor.findFirst({
    where: { id: professorId, userId },
  });
  if (!professor) return null;

  const applied = await applyFacultyEmailCheck({
    userId,
    name: professor.name,
    university: professor.university,
    existingEmail: professor.email,
    homepageUrl: professor.homepageUrl,
    allowLiveResolve: !professor.email || isJunkFacultyEmail(professor.email),
  });

  const email = applied.email;
  const emailVerified = applied.emailVerified;
  const changed =
    (professor.email || null) !== email ||
    professor.emailVerified !== emailVerified;

  await prisma.professor.update({
    where: { id: professor.id },
    data: {
      email,
      emailVerified,
      verificationNotes: applied.verificationNotes,
      homepageUrl: applied.sourceUrl || professor.homepageUrl,
    },
  });

  if (email) {
    await prisma.draft.updateMany({
      where: {
        userId,
        professorId: professor.id,
        status: { in: [...PENDING_APPROVAL_STATUSES] },
      },
      data: { recipientEmail: email },
    });
  }

  return {
    professor,
    email,
    emailVerified,
    changed,
    notes: applied.verificationNotes,
  };
}

/** Apply Settings agent_gate / auto to one pending draft (queues if review passes). */
export async function applyAgentGateToDraft(
  userId: string,
  draftId: string,
  opts?: { heuristicOnly?: boolean }
): Promise<{
  action: "queued" | "rejected" | "skipped" | "awaiting_human";
  notes: string;
}> {
  const profile = await prisma.studentProfile.findUnique({ where: { userId } });
  const mode = profile?.autoApproveMode || "manual";
  if (mode === "manual") {
    return { action: "skipped", notes: "Approval mode is Manual" };
  }

  const draft = await prisma.draft.findFirst({
    where: {
      id: draftId,
      userId,
      status: { in: [...PENDING_APPROVAL_STATUSES] },
    },
    include: { professor: true },
  });
  if (!draft) {
    return { action: "skipped", notes: "Draft not pending" };
  }

  const to = draft.recipientEmail || draft.professor?.email;
  if (!to || !draft.professor?.emailVerified) {
    await prisma.draft.update({
      where: { id: draft.id },
      data: {
        reviewStatus: "email_unverified",
        reviewNotes: "Blocked — professor email missing or not verified after re-check.",
      },
    });
    return {
      action: "skipped",
      notes: "No verified professor email",
    };
  }

  if (mode === "auto") {
    const minApprovals = profile?.autoApproveMinApprovals ?? 5;
    const n = await countHumanApprovals(userId);
    if (n < minApprovals) {
      await prisma.draft.update({
        where: { id: draft.id },
        data: {
          reviewStatus: "awaiting_human",
          reviewNotes: `Auto-approve unlocks after ${minApprovals} human approvals (have ${n}).`,
        },
      });
      return {
        action: "awaiting_human",
        notes: `Need ${minApprovals - n} more human approvals`,
      };
    }
  }

  const verdict = await reviewDraftAsStudent({
    userId,
    draftId: draft.id,
    heuristicOnly: opts?.heuristicOnly,
  });
  await prisma.draft.update({
    where: { id: draft.id },
    data: {
      reviewStatus: verdict.approve ? "agent_approved" : "agent_rejected",
      reviewNotes: `${verdict.notes} (score ${verdict.score})`,
      matchScore: verdict.score,
    },
  });

  if (!verdict.approve) {
    return { action: "rejected", notes: verdict.notes };
  }

  try {
    await approveDraftToQueue({
      userId,
      draftId: draft.id,
      via: "agent",
      specialNotes: verdict.notes,
    });
    return { action: "queued", notes: verdict.notes };
  } catch (err) {
    return {
      action: "skipped",
      notes: err instanceof Error ? err.message : "Queue failed",
    };
  }
}

/**
 * One chunk: re-verify emails on pending drafts, then agent-gate them when enabled.
 */
export async function sweepPendingApprovals(
  userId: string,
  opts?: {
    limit?: number;
    verifyEmails?: boolean;
    applyGate?: boolean;
    heuristicOnly?: boolean;
  }
): Promise<SweepResult> {
  const limit = Math.min(opts?.limit ?? 4, 8);
  const verifyEmails = opts?.verifyEmails !== false;
  const applyGate = opts?.applyGate !== false;

  const pending = await prisma.draft.findMany({
    where: {
      userId,
      status: { in: [...PENDING_APPROVAL_STATUSES] },
      // Don't re-loop the same rejected / locked drafts forever
      OR: [
        { reviewStatus: null },
        {
          reviewStatus: {
            in: [
              "pending_review",
              "awaiting_email",
              "awaiting_human",
              "email_unverified",
              "agent_scored",
              "",
            ],
          },
        },
      ],
    },
    include: { professor: true },
    orderBy: [{ updatedAt: "asc" }],
    take: 80,
  });

  const profile = await prisma.studentProfile.findUnique({ where: { userId } });
  const mode = profile?.autoApproveMode || "manual";
  const gateEnabled = applyGate && mode !== "manual";

  const emailChecks: SweepResult["emailChecks"] = [];
  const gate: SweepResult["gate"] = [];

  const chunk = pending.slice(0, limit);
  const seenProfessors = new Set<string>();

  for (const draft of chunk) {
    if (verifyEmails && draft.professorId && !seenProfessors.has(draft.professorId)) {
      seenProfessors.add(draft.professorId);
      try {
        const verified = await reverifyProfessorForDraft(userId, draft.professorId);
        if (verified) {
          emailChecks.push({
            draftId: draft.id,
            professorName: verified.professor.name,
            email: verified.email,
            emailVerified: verified.emailVerified,
            changed: verified.changed,
            notes: verified.notes,
          });
          if (!verified.emailVerified) {
            await prisma.draft.update({
              where: { id: draft.id },
              data: {
                reviewStatus: "email_unverified",
                reviewNotes:
                  "Email re-check failed — left unverified. Fix in Directory Re-check, then tap Verify emails + agent gate.",
              },
            });
          }
        }
      } catch (err) {
        emailChecks.push({
          draftId: draft.id,
          professorName: draft.professor?.name || "?",
          email: draft.professor?.email || null,
          emailVerified: false,
          changed: false,
          notes: err instanceof Error ? err.message : "reverify failed",
        });
      }
    }

    if (gateEnabled) {
      const result = await applyAgentGateToDraft(userId, draft.id, {
        heuristicOnly: opts?.heuristicOnly,
      });
      gate.push({ draftId: draft.id, ...result });
    }
  }

  const stillPending = await prisma.draft.count({
    where: {
      userId,
      status: { in: [...PENDING_APPROVAL_STATUSES] },
    },
  });

  return {
    emailChecks,
    gate,
    remaining: Math.max(0, stillPending),
    processed: chunk.length,
  };
}
