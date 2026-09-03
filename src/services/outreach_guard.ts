/**
 * One professor → one active outreach path (draft or queue or sent).
 */
import { prisma } from "@/lib/prisma";

export const ACTIVE_QUEUE_STATUSES = ["scheduled", "sending"] as const;

/** Draft statuses that mean we should not create another outreach for the professor. */
export const BLOCKING_DRAFT_STATUSES = [
  "pending",
  "pending_review",
  "scheduled",
  "approved",
] as const;

export type OutreachBlockReason =
  | "already_contacted"
  | "already_queued"
  | "draft_exists";

export async function getProfessorOutreachBlockReason(
  userId: string,
  professorId: string,
  opts?: { excludeDraftId?: string }
): Promise<OutreachBlockReason | null> {
  const sent = await prisma.sentHistory.findFirst({
    where: { userId, professorId, kind: "outreach" },
    select: { id: true },
  });
  if (sent) return "already_contacted";

  const queued = await prisma.scheduledEmail.findFirst({
    where: {
      userId,
      professorId,
      kind: "outreach",
      status: { in: [...ACTIVE_QUEUE_STATUSES] },
    },
    select: { id: true },
  });
  if (queued) return "already_queued";

  const draft = await prisma.draft.findFirst({
    where: {
      userId,
      professorId,
      status: { in: [...BLOCKING_DRAFT_STATUSES] },
      ...(opts?.excludeDraftId ? { NOT: { id: opts.excludeDraftId } } : {}),
    },
    select: { id: true },
  });
  if (draft) return "draft_exists";

  return null;
}

export async function assertProfessorOutreachAllowed(
  userId: string,
  professorId: string,
  opts?: { excludeDraftId?: string }
) {
  const reason = await getProfessorOutreachBlockReason(
    userId,
    professorId,
    opts
  );
  if (!reason) return;
  const messages: Record<OutreachBlockReason, string> = {
    already_contacted: "Outreach was already sent to this professor.",
    already_queued: "This professor already has an email in the send queue.",
    draft_exists: "A draft or queued email already exists for this professor.",
  };
  throw new Error(messages[reason]);
}

/** Professor IDs with an active outreach draft, queue row, or prior send. */
export async function listBlockedProfessorIds(userId: string) {
  const [sent, queued, drafts] = await Promise.all([
    prisma.sentHistory.findMany({
      where: { userId, kind: "outreach", professorId: { not: null } },
      select: { professorId: true },
      distinct: ["professorId"],
    }),
    prisma.scheduledEmail.findMany({
      where: {
        userId,
        kind: "outreach",
        status: { in: [...ACTIVE_QUEUE_STATUSES] },
        professorId: { not: null },
      },
      select: { professorId: true },
      distinct: ["professorId"],
    }),
    prisma.draft.findMany({
      where: {
        userId,
        professorId: { not: null },
        status: { in: [...BLOCKING_DRAFT_STATUSES] },
      },
      select: { professorId: true },
      distinct: ["professorId"],
    }),
  ]);

  const blocked = new Set<string>();
  for (const row of [...sent, ...queued, ...drafts]) {
    if (row.professorId) blocked.add(row.professorId);
  }
  return blocked;
}

/**
 * Cancel duplicate queue rows for the same professor (keeps earliest scheduled).
 */
export async function dedupeScheduledOutreach(userId: string) {
  const rows = await prisma.scheduledEmail.findMany({
    where: {
      userId,
      kind: "outreach",
      status: { in: [...ACTIVE_QUEUE_STATUSES] },
      professorId: { not: null },
    },
    orderBy: [{ scheduledIso: "asc" }, { createdAt: "asc" }],
    select: { id: true, professorId: true },
  });

  const keep = new Map<string, string>();
  const cancelIds: string[] = [];

  for (const row of rows) {
    const pid = row.professorId!;
    if (!keep.has(pid)) {
      keep.set(pid, row.id);
      continue;
    }
    cancelIds.push(row.id);
  }

  if (!cancelIds.length) {
    return { cancelled: 0, kept: keep.size };
  }

  const result = await prisma.scheduledEmail.updateMany({
    where: { id: { in: cancelIds }, userId },
    data: {
      status: "cancelled",
      lastError: "Duplicate outreach cancelled — professor already queued",
    },
  });

  for (const professorId of keep.keys()) {
    const drafts = await prisma.draft.findMany({
      where: {
        userId,
        professorId,
        status: { in: [...BLOCKING_DRAFT_STATUSES] },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    const extraDraftIds = drafts.slice(1).map((d) => d.id);
    if (!extraDraftIds.length) continue;
    await prisma.draft.updateMany({
      where: { id: { in: extraDraftIds } },
      data: {
        status: "rejected",
        reviewStatus: "duplicate_cancelled",
        reviewNotes: "Superseded by existing queued outreach for this professor.",
      },
    });
  }

  return { cancelled: result.count, kept: keep.size };
}
