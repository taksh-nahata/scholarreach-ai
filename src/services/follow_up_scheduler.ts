/**
 * Auto-schedule polite follow-ups when a professor hasn't replied.
 * Follow-ups stay on the SAME Gmail thread as the original outreach.
 * A/B tests short bump vs value nudge.
 */
import { prisma } from "@/lib/prisma";
import { dripDispatcher } from "@/services/drip_dispatcher";
import { prepareEmailBodies } from "@/services/email_format";
import { getProfileBundle } from "@/services/profile_service";
import { sanitizeEmailText } from "@/services/email_format";
import {
  isFollowUpEligibleAddress,
  isLegacyContactedSubject,
} from "@/services/follow_up_guards";

export { isFollowUpEligibleAddress, isLegacyContactedSubject };

export type FollowUpVariant = "short_bump" | "value_nudge";

function lastName(full: string) {
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1] || full;
}

function followUpSubject(original: string) {
  const cleaned = sanitizeEmailText(original || "").replace(/^re:\s*/i, "");
  return `Re: ${cleaned}`;
}

function pickVariant(): FollowUpVariant {
  return Math.random() < 0.5 ? "short_bump" : "value_nudge";
}

function buildFollowUpBody(opts: {
  professorName: string;
  studentName: string;
  workMode: string;
  daysSince: number;
  originalSubject: string;
  variant: FollowUpVariant;
}) {
  const ln = lastName(opts.professorName.replace(/^dr\.?\s+/i, ""));
  const when =
    opts.daysSince >= 10
      ? "a couple of weeks ago"
      : opts.daysSince >= 7
        ? "last week"
        : "a few days ago";

  if (opts.variant === "short_bump") {
    return [
      `Dear Dr. ${ln},`,
      "",
      `Just bumping my note from ${when} in case it got buried — still very interested in helping with any ${opts.workMode} volunteer tasks that would be useful to your group.`,
      "",
      "Happy to keep this short; a one-line yes/no (or a referral) is more than enough.",
      "",
      "Thank you,",
      opts.studentName,
    ].join("\n");
  }

  return [
    `Dear Dr. ${ln},`,
    "",
    `I wanted to briefly follow up on my note from ${when} about a ${opts.workMode} volunteer research opportunity.`,
    "",
    "I remain interested in supporting your lab with concrete remote work — data processing, simulation, literature support, or whatever is most useful to your students right now. If timing is bad or you have a preferred entry path (open-source, a lab program, another contact), I would be grateful for any pointer.",
    "",
    "Thank you for your time,",
    opts.studentName,
  ].join("\n");
}

export async function cancelPendingFollowUpsForSent(
  userId: string,
  sentHistoryId: string,
  toEmail?: string
) {
  const byParent = await prisma.scheduledEmail.updateMany({
    where: {
      userId,
      status: "scheduled",
      kind: "follow_up",
      sentHistoryId,
    },
    data: { status: "cancelled", lastError: "Cancelled — professor replied" },
  });

  let byEmail = { count: 0 };
  if (toEmail) {
    byEmail = await prisma.scheduledEmail.updateMany({
      where: {
        userId,
        status: "scheduled",
        kind: "follow_up",
        toEmail: toEmail.toLowerCase(),
      },
      data: { status: "cancelled", lastError: "Cancelled — professor replied" },
    });
  }

  await prisma.sentHistory.update({
    where: { id: sentHistoryId },
    data: { followUpQueuedAt: null },
  });

  return { cancelled: byParent.count + byEmail.count };
}

export async function scheduleFollowUpsForUser(userId: string) {
  const bundle = await getProfileBundle(userId);
  const profile = bundle?.profile;
  if (!profile) return { skipped: true, reason: "no_profile", queued: 0 };

  const enabled = (profile as { followUpEnabled?: boolean }).followUpEnabled !== false;
  if (!enabled) return { skipped: true, reason: "disabled", queued: 0 };

  const afterDays = Math.min(
    21,
    Math.max(3, (profile as { followUpAfterDays?: number }).followUpAfterDays ?? 7)
  );
  const maxCount = Math.min(
    2,
    Math.max(1, (profile as { followUpMaxCount?: number }).followUpMaxCount ?? 1)
  );

  const cutoff = new Date(Date.now() - afterDays * 24 * 60 * 60 * 1000);
  const studentName =
    profile.displayName || bundle?.user?.name || "Student researcher";
  const workMode =
    profile.workModePref === "hybrid"
      ? "hybrid"
      : profile.workModePref === "in_person"
        ? "in-person"
        : "strictly remote";

  const platformSent = await prisma.scheduledEmail.findMany({
    where: {
      userId,
      status: "sent",
      kind: "outreach",
    },
    select: { toEmail: true },
  });
  const platformEmails = new Set(
    platformSent.map((r) => r.toEmail.toLowerCase())
  );

  const candidates = await prisma.sentHistory.findMany({
    where: {
      userId,
      kind: "outreach",
      replyDetected: false,
      sentAt: { lte: cutoff },
      followUpCount: { lt: maxCount },
      professorId: { not: null },
      NOT: {
        subject: { contains: "legacy contacted", mode: "insensitive" },
      },
    },
    orderBy: { sentAt: "asc" },
    take: 80,
  });

  let queued = 0;
  const items: Array<{ to: string; when: string; variant: string }> = [];
  const variantCounts = { short_bump: 0, value_nudge: 0 };

  for (const row of candidates) {
    const to = row.toEmail.toLowerCase();
    if (!isFollowUpEligibleAddress(to)) continue;
    if (isLegacyContactedSubject(row.subject)) continue;
    if (!row.professorId) continue;
    if (!platformEmails.has(to)) continue;

    const existing = await prisma.scheduledEmail.findFirst({
      where: {
        userId,
        status: "scheduled",
        kind: "follow_up",
        OR: [
          { sentHistoryId: row.id },
          { toEmail: row.toEmail.toLowerCase() },
        ],
      },
    });
    if (existing) continue;

    const pendingAny = await prisma.scheduledEmail.findFirst({
      where: {
        userId,
        toEmail: row.toEmail.toLowerCase(),
        status: "scheduled",
      },
    });
    if (pendingAny) continue;

    const daysSince = Math.max(
      1,
      Math.round((Date.now() - row.sentAt.getTime()) / (24 * 60 * 60 * 1000))
    );

    const variant = pickVariant();
    const subject = followUpSubject(row.subject);
    const rawBody = buildFollowUpBody({
      professorName: row.professorName || "Professor",
      studentName,
      workMode,
      daysSince,
      originalSubject: row.subject,
      variant,
    });
    const prepared = prepareEmailBodies(rawBody, false);
    const slot = dripDispatcher.getNextAcademicWindowSlot(
      new Date(),
      row.university
    );

    await prisma.$transaction([
      prisma.scheduledEmail.create({
        data: {
          userId,
          professorId: row.professorId,
          professorName: row.professorName,
          university: row.university,
          toEmail: row.toEmail.toLowerCase(),
          ccEmails: row.ccEmails,
          subject,
          body: prepared.body,
          htmlBody: prepared.htmlBody,
          scheduledIso: slot,
          scheduledTime: dripDispatcher.formatSlot(slot, row.university),
          status: "scheduled",
          kind: "follow_up",
          sentHistoryId: row.id,
          variant,
          replyToThreadId: row.gmailThreadId || null,
          replyToMessageId: row.gmailMessageId || null,
        },
      }),
      prisma.sentHistory.update({
        where: { id: row.id },
        data: { followUpQueuedAt: new Date() },
      }),
    ]);

    variantCounts[variant] += 1;
    queued += 1;
    items.push({
      to: row.toEmail,
      when: dripDispatcher.formatSlot(slot, row.university),
      variant,
    });
  }

  return {
    skipped: false,
    afterDays,
    maxCount,
    checked: candidates.length,
    queued,
    variantCounts,
    items,
  };
}

export async function scheduleFollowUpsForAllUsers() {
  const users = await prisma.user.findMany({
    where: {
      OR: [{ gmailConnected: true }, { mailConnected: true }],
    },
    select: { id: true, email: true },
    take: 80,
  });

  const summary = [];
  for (const u of users) {
    try {
      const r = await scheduleFollowUpsForUser(u.id);
      summary.push({ userId: u.id, email: u.email, ...r });
    } catch (err) {
      summary.push({
        userId: u.id,
        email: u.email,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return summary;
}
