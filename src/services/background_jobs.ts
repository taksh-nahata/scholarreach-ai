/**
 * DB-backed background jobs (email reverify, etc.) so progress survives
 * tab switches and is visible from every app page.
 */
import { prisma } from "@/lib/prisma";
import { applyFacultyEmailCheck } from "@/services/faculty_email_apply";
import {
  isJunkFacultyEmail,
  scoreEmailCandidate,
} from "@/services/faculty_email_verifier";
import { PENDING_APPROVAL_STATUSES } from "@/lib/draft_status";
import { parseJsonArray, toJsonArray } from "@/lib/utils";
import {
  formatCcForStorage,
  normalizeCcList,
} from "@/services/outreach_recipients";
import {
  mergeMentorshipEvidence,
  parseProfessorMentorshipEvidence,
  serializeMentorshipEvidence,
} from "@/services/mentorship_evidence";

export type JobLogEntry = { at: string; msg: string };

export type JobPublic = {
  id: string;
  type: string;
  status: string;
  total: number;
  processed: number;
  verified: number;
  failed: number;
  percent: number;
  lastMessage: string | null;
  eventLog: JobLogEntry[];
  updatedAt: string;
  createdAt: string;
};

function parseLog(raw: string | null | undefined): JobLogEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as JobLogEntry[]).slice(-40) : [];
  } catch {
    return [];
  }
}

function withLog(existing: string | null | undefined, msg: string) {
  const list = parseLog(existing);
  list.push({ at: new Date().toISOString(), msg });
  return JSON.stringify(list.slice(-40));
}

function toPublic(job: {
  id: string;
  type: string;
  status: string;
  total: number;
  processed: number;
  verified: number;
  failed: number;
  lastMessage: string | null;
  eventLog?: string | null;
  updatedAt: Date;
  createdAt?: Date;
}): JobPublic {
  const percent =
    job.total > 0 ? Math.min(100, Math.round((job.processed / job.total) * 100)) : 0;
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    total: job.total,
    processed: job.processed,
    verified: job.verified,
    failed: job.failed,
    percent,
    lastMessage: job.lastMessage,
    eventLog: parseLog(job.eventLog),
    updatedAt: job.updatedAt.toISOString(),
    createdAt: (job.createdAt || job.updatedAt).toISOString(),
  };
}

/** Cancel jobs that have been running forever with no progress. */
export async function cancelStaleJobs(userId: string) {
  const cutoff = new Date(Date.now() - 90 * 60 * 1000); // 90 min
  const stale = await prisma.backgroundJob.findMany({
    where: {
      userId,
      status: "running",
      OR: [
        { updatedAt: { lt: cutoff }, processed: 0 },
        { createdAt: { lt: new Date(Date.now() - 6 * 60 * 60 * 1000) } },
      ],
    },
    select: { id: true, type: true, eventLog: true },
  });
  for (const job of stale) {
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "cancelled",
        lastMessage: "Cancelled — stuck with no progress",
        eventLog: withLog(
          job.eventLog,
          "Auto-cancelled: no progress for too long (was blocking other jobs)"
        ),
      },
    });
  }
  return stale.length;
}

async function listProfessorIdsNeedingReverify(userId: string, all: boolean) {
  const professors = await prisma.professor.findMany({
    where: { userId },
    orderBy: [{ emailVerified: "asc" }, { updatedAt: "asc" }],
    select: {
      id: true,
      email: true,
      emailVerified: true,
      name: true,
      university: true,
      homepageUrl: true,
    },
  });

  if (all) return professors.map((p) => p.id);

  return professors
    .filter((p) => {
      if (!p.email) return true;
      if (!p.emailVerified) return true;
      if (isJunkFacultyEmail(p.email)) return true;
      const scored = scoreEmailCandidate({
        email: p.email,
        name: p.name,
        university: p.university,
        homepageUrl: p.homepageUrl,
      });
      return !(scored.domainMatch && scored.nameMatch);
    })
    .map((p) => p.id);
}

/** Start (or replace) a full-directory email reverify job. */
export async function startEmailReverifyJob(
  userId: string,
  opts?: { all?: boolean; professorIds?: string[] }
) {
  const all = opts?.all !== false; // default: check everyone
  const ids =
    opts?.professorIds?.length && opts.professorIds
      ? opts.professorIds
      : await listProfessorIdsNeedingReverify(userId, all);

  // Cancel prior running reverify jobs for this user
  await prisma.backgroundJob.updateMany({
    where: { userId, type: "email_reverify", status: "running" },
    data: { status: "cancelled", lastMessage: "Superseded by a new re-check" },
  });

  // Prefer trusting stored emails; only live-scrape missing/junk ones
  const lastMessage = ids.length
    ? `Queued ${ids.length} professors (trust existing emails first; scrape only if missing)`
    : "Nothing to re-check";

  const job = await prisma.backgroundJob.create({
    data: {
      userId,
      type: "email_reverify",
      status: ids.length ? "running" : "completed",
      total: ids.length,
      processed: 0,
      verified: 0,
      failed: 0,
      payload: JSON.stringify({ professorIds: ids, cursor: 0, mode: "trust_first" }),
      lastMessage,
      eventLog: JSON.stringify([
        {
          at: new Date().toISOString(),
          msg: lastMessage,
        },
      ]),
    },
  });

  return toPublic(job);
}

/** Process the next small chunk (safe for Hobby timeouts). */
export async function tickEmailReverifyJob(userId: string, batchSize = 3) {
  const job = await prisma.backgroundJob.findFirst({
    where: { userId, type: "email_reverify", status: "running" },
    orderBy: { createdAt: "desc" },
  });
  if (!job) return null;

  const payload = JSON.parse(job.payload || "{}") as {
    professorIds?: string[];
    cursor?: number;
  };
  const ids = payload.professorIds || [];
  let cursor = payload.cursor || 0;
  if (cursor >= ids.length) {
    const done = await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        processed: ids.length,
        lastMessage: `Done · ${job.verified} verified · ${job.failed} unmet`,
      },
    });
    return toPublic(done);
  }

  const slice = ids.slice(cursor, cursor + batchSize);
  let verifiedDelta = 0;
  let failedDelta = 0;
  const names: string[] = [];

  for (const id of slice) {
    const p = await prisma.professor.findFirst({
      where: { id, userId },
    });
    if (!p) {
      failedDelta += 1;
      continue;
    }
    names.push(p.name);
    try {
      // Prefer trusting a stored name+school email. Only live-scrape when missing/junk.
      const applied = await applyFacultyEmailCheck({
        userId,
        name: p.name,
        university: p.university,
        existingEmail: p.email,
        homepageUrl: p.homepageUrl,
        allowLiveResolve: !p.email || isJunkFacultyEmail(p.email),
      });

      const ccMerged = normalizeCcList(
        [...parseJsonArray(p.ccEmails), ...(applied.ccEmails || [])],
        applied.email,
        3
      );
      const mentorshipMerged = mergeMentorshipEvidence(
        parseProfessorMentorshipEvidence(p.mentorshipEvidence),
        applied.mentorshipEvidence || []
      );
      const mentorshipJson = serializeMentorshipEvidence(mentorshipMerged);

      await prisma.professor.update({
        where: { id: p.id },
        data: {
          email: applied.email,
          emailVerified: applied.emailVerified,
          verificationNotes: applied.verificationNotes,
          homepageUrl: applied.sourceUrl || p.homepageUrl,
          ccEmails: toJsonArray(ccMerged),
          mentorshipEvidence: mentorshipJson,
        },
      });

      if (applied.email && applied.email !== p.email) {
        await prisma.draft.updateMany({
          where: {
            userId,
            professorId: p.id,
            status: { in: [...PENDING_APPROVAL_STATUSES] },
          },
          data: { recipientEmail: applied.email },
        });
      }

      if (ccMerged.length) {
        const ccStorage = formatCcForStorage(ccMerged);
        await prisma.draft.updateMany({
          where: {
            userId,
            professorId: p.id,
            status: { in: [...PENDING_APPROVAL_STATUSES] },
          },
          data: { ccEmails: ccStorage },
        });
      }

      if (applied.emailVerified) verifiedDelta += 1;
      else failedDelta += 1;
    } catch {
      failedDelta += 1;
    }
  }

  cursor += slice.length;
  const processed = cursor;
  const verified = job.verified + verifiedDelta;
  const failed = job.failed + failedDelta;
  const done = cursor >= ids.length;

  const updated = await prisma.backgroundJob.update({
    where: { id: job.id },
    data: {
      processed,
      verified,
      failed,
      status: done ? "completed" : "running",
      payload: JSON.stringify({ professorIds: ids, cursor }),
      lastMessage: done
        ? `Done · ${verified} verified of ${ids.length}`
        : `Checking ${names.slice(0, 2).join(", ")}${names.length > 2 ? "…" : ""} (${processed}/${ids.length})`,
      eventLog: withLog(
        job.eventLog,
        done
          ? `Finished: ${verified} verified, ${failed} unmet`
          : `Checked: ${names.slice(0, 3).join(", ") || "batch"} (${processed}/${ids.length})`
      ),
    },
  });

  return toPublic(updated);
}

export async function getActiveJobs(userId: string): Promise<JobPublic[]> {
  const jobs = await prisma.backgroundJob.findMany({
    where: {
      userId,
      OR: [
        { status: "running" },
        {
          status: "completed",
          updatedAt: { gte: new Date(Date.now() - 60_000) },
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });
  return jobs.map(toPublic);
}

export async function cancelJob(userId: string, jobId: string) {
  await prisma.backgroundJob.updateMany({
    where: { id: jobId, userId, status: "running" },
    data: { status: "cancelled", lastMessage: "Cancelled" },
  });
}

/** Cron helper: advance all running reverify jobs a little. */
export async function tickAllRunningReverifyJobs(limitUsers = 20) {
  const running = await prisma.backgroundJob.findMany({
    where: { type: "email_reverify", status: "running" },
    orderBy: { updatedAt: "asc" },
    take: limitUsers,
    select: { userId: true },
  });
  const out = [];
  for (const row of running) {
    try {
      out.push(await tickEmailReverifyJob(row.userId, 3));
    } catch (err) {
      out.push({
        userId: row.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

/** Start a background mine job — survives tab switches (unlike a single long POST). */
export async function startMineLeadsJob(userId: string, count = 20) {
  const target = Math.min(Math.max(Number(count) || 20, 1), 35);

  await prisma.backgroundJob.updateMany({
    where: { userId, type: "mine_leads", status: "running" },
    data: { status: "cancelled", lastMessage: "Superseded by a new mine" },
  });

  const job = await prisma.backgroundJob.create({
    data: {
      userId,
      type: "mine_leads",
      status: "running",
      total: target,
      processed: 0,
      verified: 0,
      failed: 0,
      payload: JSON.stringify({ target }),
      lastMessage: `Starting…`,
      eventLog: JSON.stringify([
        {
          at: new Date().toISOString(),
          msg: `Started mining up to ${target} leads`,
        },
      ]),
    },
  });

  return toPublic(job);
}

/** Mine a small batch toward the job target. */
export async function tickMineLeadsJob(userId: string, batchSize = 1) {
  const job = await prisma.backgroundJob.findFirst({
    where: { userId, type: "mine_leads", status: "running" },
    orderBy: { createdAt: "desc" },
  });
  if (!job) return null;

  const remaining = Math.max(0, job.total - job.verified);
  if (remaining <= 0) {
    const done = await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        processed: job.total,
        lastMessage: `Done · mined ${job.verified} leads`,
        eventLog: withLog(job.eventLog, `Completed with ${job.verified} leads`),
      },
    });
    return toPublic(done);
  }

  const { mineFreshLeads } = await import("@/services/faculty_miner");
  let mined = 0;
  const mineTimeoutMs = Number(process.env.MINE_TICK_TIMEOUT_MS || 55_000);
  try {
    const result = await Promise.race([
      mineFreshLeads(userId, Math.min(batchSize, remaining)),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(new Error(`Mine tick timed out after ${mineTimeoutMs}ms`)),
          mineTimeoutMs
        )
      ),
    ]);
    mined = Number((result as { mined?: number }).mined) || 0;
  } catch (err) {
    const failed = job.failed + 1;
    const errMsg = err instanceof Error ? err.message : "unknown";
    if (failed >= 5) {
      const done = await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "completed",
          failed,
          lastMessage: `Stopped after errors · mined ${job.verified}/${job.total}`,
          eventLog: withLog(
            job.eventLog,
            `Stopped after ${failed} errors: ${errMsg.slice(0, 120)}`
          ),
        },
      });
      return toPublic(done);
    }
    const updated = await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        failed,
        lastMessage: `Mine error: ${errMsg.slice(0, 80)}`,
        eventLog: withLog(job.eventLog, `Error: ${errMsg.slice(0, 160)}`),
      },
    });
    return toPublic(updated);
  }

  const verified = job.verified + mined;
  const processed = Math.min(job.total, Math.max(job.processed + 1, verified));
  const stalled = mined === 0 ? job.failed + 1 : job.failed;
  const giveUp = stalled >= 8 && verified < job.total;
  const done = verified >= job.total || giveUp;
  const msg = done
    ? `Done · mined ${verified} leads${
        giveUp && verified < job.total ? " (fewer unique matches found)" : ""
      }`
    : mined
      ? `Found ${verified}/${job.total} so far…`
      : `No new matches this round (${stalled}/8 stalls) · ${verified}/${job.total}`;

  const updated = await prisma.backgroundJob.update({
    where: { id: job.id },
    data: {
      verified,
      processed: done ? job.total : processed,
      failed: stalled,
      status: done ? "completed" : "running",
      lastMessage: msg,
      eventLog: withLog(
        job.eventLog,
        mined
          ? `+${mined} lead(s) · total ${verified}/${job.total}`
          : `Tick found 0 new leads (stall ${stalled})`
      ),
    },
  });

  return toPublic(updated);
}

/** Advance any running background jobs (all types). */
export async function tickAllRunningJobs(limitUsers = 20) {
  const running = await prisma.backgroundJob.findMany({
    where: { status: "running" },
    orderBy: { updatedAt: "asc" },
    take: limitUsers * 4,
    select: { userId: true, type: true },
  });

  const byUser = new Map<string, Set<string>>();
  for (const row of running) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, new Set());
    byUser.get(row.userId)!.add(row.type);
  }

  const out: Array<JobPublic | { userId: string; error: string }> = [];
  let n = 0;
  for (const [userId, types] of byUser) {
    if (n >= limitUsers) break;
    n += 1;
    try {
      const ticks = await tickUserJobs(userId, types);
      out.push(...ticks);
    } catch (err) {
      out.push({
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

/** Tick ONE running job for this user (oldest first) so slow mines don't starve drafts. */
export async function tickUserJobs(
  userId: string,
  types?: Set<string>
): Promise<JobPublic[]> {
  await cancelStaleJobs(userId);

  const running = await prisma.backgroundJob.findMany({
    where: {
      userId,
      status: "running",
      ...(types?.size
        ? { type: { in: [...types] } }
        : {}),
    },
    orderBy: { updatedAt: "asc" },
    take: 8,
    select: { type: true, id: true, updatedAt: true },
  });
  if (!running.length) return [];

  // Prefer non-mine jobs if a mine has been sitting while others wait
  const preferred =
    running.find((j) => j.type !== "mine_leads") || running[0];

  let result: JobPublic | null = null;
  try {
    if (preferred.type === "mine_leads") {
      result = await tickMineLeadsJob(userId, 2);
    } else if (preferred.type === "email_reverify") {
      result = await tickEmailReverifyJob(userId, 6);
    } else if (preferred.type === "draft_generate") {
      result = await tickDraftGenerateJob(userId, 3);
    } else if (preferred.type === "approval_sweep") {
      result = await tickApprovalSweepJob(userId, 6);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const job = await prisma.backgroundJob.findUnique({
      where: { id: preferred.id },
    });
    if (job) {
      result = toPublic(
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: {
            failed: job.failed + 1,
            lastMessage: `Tick error: ${msg.slice(0, 100)}`,
            eventLog: withLog(job.eventLog, `Error: ${msg.slice(0, 160)}`),
          },
        })
      );
    }
  }

  return result ? [result] : [];
}

/** Write personalized drafts for a list of professors (1 per tick). */
export async function startDraftGenerateJob(
  userId: string,
  professorIds: string[]
) {
  const ids = Array.from(new Set(professorIds.filter(Boolean))).slice(0, 35);

  await prisma.backgroundJob.updateMany({
    where: { userId, type: "draft_generate", status: "running" },
    data: { status: "cancelled", lastMessage: "Superseded by a new draft job" },
  });

  const job = await prisma.backgroundJob.create({
    data: {
      userId,
      type: "draft_generate",
      status: ids.length ? "running" : "completed",
      total: ids.length,
      processed: 0,
      verified: 0,
      failed: 0,
      payload: JSON.stringify({ professorIds: ids, cursor: 0 }),
      lastMessage: ids.length
        ? `Queued ${ids.length} drafts…`
        : "Nothing to draft",
      eventLog: JSON.stringify([
        {
          at: new Date().toISOString(),
          msg: ids.length
            ? `Started draft job for ${ids.length} professor(s)`
            : "Nothing to draft",
        },
      ]),
    },
  });

  return toPublic(job);
}

export async function tickDraftGenerateJob(userId: string, batchSize = 1) {
  const job = await prisma.backgroundJob.findFirst({
    where: { userId, type: "draft_generate", status: "running" },
    orderBy: { createdAt: "desc" },
  });
  if (!job) return null;

  const payload = JSON.parse(job.payload || "{}") as {
    professorIds?: string[];
    cursor?: number;
  };
  const ids = payload.professorIds || [];
  let cursor = payload.cursor || 0;

  if (cursor >= ids.length) {
    return toPublic(
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "completed",
          processed: ids.length,
          lastMessage: `Done · ${job.verified} drafts · ${job.failed} skipped`,
        },
      })
    );
  }

  const { generatePersonalizedDraft } = await import(
    "@/services/email_personalizer"
  );
  const { getProfessorOutreachBlockReason } = await import(
    "@/services/outreach_guard"
  );
  const slice = ids.slice(cursor, cursor + batchSize);
  let ok = 0;
  let fail = 0;
  const names: string[] = [];

  for (const professorId of slice) {
    const p = await prisma.professor.findFirst({
      where: { id: professorId, userId },
      select: { name: true },
    });
    if (p) names.push(p.name);
    try {
      const blocked = await getProfessorOutreachBlockReason(userId, professorId);
      if (blocked) {
        fail += 1;
        continue;
      }
      await generatePersonalizedDraft({ userId, professorId });
      ok += 1;
    } catch {
      fail += 1;
    }
  }

  cursor += slice.length;
  const verified = job.verified + ok;
  const failed = job.failed + fail;
  const done = cursor >= ids.length;

  return toPublic(
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        processed: cursor,
        verified,
        failed,
        status: done ? "completed" : "running",
        payload: JSON.stringify({ professorIds: ids, cursor }),
        lastMessage: done
          ? `Done · ${verified} drafts · ${failed} skipped`
          : `Drafting ${names.slice(0, 2).join(", ")}${
              names.length > 2 ? "…" : ""
            } (${cursor}/${ids.length})`,
        eventLog: withLog(
          job.eventLog,
          done
            ? `Finished drafts: ${verified} ok, ${failed} skipped`
            : `${ok ? "Wrote" : "Skipped"} ${names[0] || "professor"} (${cursor}/${ids.length})`
        ),
      },
    })
  );
}

/** Pending-approvals sweep: verify emails + agent gate in chunks. */
export async function startApprovalSweepJob(userId: string) {
  const pending = await prisma.draft.count({
    where: {
      userId,
      status: { in: [...PENDING_APPROVAL_STATUSES] },
    },
  });

  await prisma.backgroundJob.updateMany({
    where: { userId, type: "approval_sweep", status: "running" },
    data: { status: "cancelled", lastMessage: "Superseded by a new sweep" },
  });

  const job = await prisma.backgroundJob.create({
    data: {
      userId,
      type: "approval_sweep",
      status: pending ? "running" : "completed",
      total: Math.max(pending, 1),
      processed: 0,
      verified: 0,
      failed: 0,
      payload: JSON.stringify({ queued: 0, emptyRounds: 0 }),
      lastMessage: pending
        ? `Sweeping ${pending} pending drafts…`
        : "No pending drafts to sweep",
    },
  });

  return toPublic(job);
}

export async function tickApprovalSweepJob(userId: string, batchSize = 3) {
  const job = await prisma.backgroundJob.findFirst({
    where: { userId, type: "approval_sweep", status: "running" },
    orderBy: { createdAt: "desc" },
  });
  if (!job) return null;

  const payload = JSON.parse(job.payload || "{}") as {
    queued?: number;
    emptyRounds?: number;
  };

  const { sweepPendingApprovals } = await import(
    "@/services/pending_approvals_sweep"
  );

  let result;
  try {
    result = await sweepPendingApprovals(userId, {
      limit: batchSize,
      verifyEmails: true,
      applyGate: true,
      heuristicOnly: true,
    });
  } catch (err) {
    const failed = job.failed + 1;
    if (failed >= 5) {
      return toPublic(
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: {
            status: "completed",
            failed,
            lastMessage: `Sweep stopped: ${
              err instanceof Error ? err.message.slice(0, 100) : "error"
            }`,
          },
        })
      );
    }
    return toPublic(
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          failed,
          lastMessage: `Sweep error: ${
            err instanceof Error ? err.message.slice(0, 80) : "unknown"
          }`,
        },
      })
    );
  }

  const queuedDelta = result.gate.filter((g) => g.action === "queued").length;
  const queued = (payload.queued || 0) + queuedDelta;
  const processed = job.processed + result.processed;
  const verified = job.verified + queuedDelta;
  const emptyRounds =
    result.processed === 0 ? (payload.emptyRounds || 0) + 1 : 0;
  const done =
    result.remaining === 0 || result.processed === 0 || emptyRounds >= 3;

  return toPublic(
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        processed: Math.min(Math.max(processed, job.processed + 1), job.total),
        verified,
        status: done ? "completed" : "running",
        total: Math.max(job.total, processed + result.remaining),
        payload: JSON.stringify({ queued, emptyRounds }),
        lastMessage: done
          ? `Sweep done · ${queued} auto-queued`
          : `Sweep… ${queued} queued · ${result.remaining} left`,
      },
    })
  );
}

export const JOB_TYPE_LABELS: Record<string, string> = {
  email_reverify: "Re-checking professor emails",
  mine_leads: "Mining fresh faculty leads",
  draft_generate: "Writing email drafts",
  approval_sweep: "Approvals sweep (emails + agent gate)",
};
