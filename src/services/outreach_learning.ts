/**
 * Aggregate reply outcomes into actionable drafting guidance.
 */
import { prisma } from "@/lib/prisma";

export type OutreachLearnings = {
  updatedAt: string;
  sampleSize: number;
  replyRate: number;
  interestedCount: number;
  referralCount: number;
  declineCount: number;
  followUpReplyShare: number;
  winningFollowUpVariant: string | null;
  variantStats: Array<{
    variant: string;
    sent: number;
    replies: number;
    replyRate: number;
  }>;
  lessons: string[];
  promptBrief: string;
};

export async function refreshOutreachLearnings(
  userId: string
): Promise<OutreachLearnings> {
  const [sent, replied, insights, followUpSent] = await Promise.all([
    prisma.sentHistory.findMany({
      where: { userId },
      select: {
        id: true,
        kind: true,
        variant: true,
        replyDetected: true,
        subject: true,
      },
    }),
    prisma.sentHistory.count({
      where: { userId, replyDetected: true },
    }),
    prisma.replyInsight.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 80,
      select: {
        sentiment: true,
        replyToKind: true,
        recommendation: true,
        opportunitiesJson: true,
        headline: true,
      },
    }),
    prisma.sentHistory.findMany({
      where: { userId, kind: "follow_up" },
      select: { variant: true, replyDetected: true },
    }),
  ]);

  const sampleSize = sent.length;
  const replyRate = sampleSize ? replied / sampleSize : 0;
  const interestedCount = insights.filter((i) => i.sentiment === "interested")
    .length;
  const referralCount = insights.filter((i) => i.sentiment === "referral")
    .length;
  const declineCount = insights.filter((i) => i.sentiment === "decline").length;
  const followUpReplies = insights.filter(
    (i) => i.replyToKind === "follow_up"
  ).length;
  const followUpReplyShare = insights.length
    ? followUpReplies / insights.length
    : 0;

  const byVariant = new Map<string, { sent: number; replies: number }>();
  for (const row of followUpSent) {
    const key = row.variant || "unknown";
    const cur = byVariant.get(key) || { sent: 0, replies: 0 };
    cur.sent += 1;
    if (row.replyDetected) cur.replies += 1;
    byVariant.set(key, cur);
  }
  const variantStats = [...byVariant.entries()].map(([variant, s]) => ({
    variant,
    sent: s.sent,
    replies: s.replies,
    replyRate: s.sent ? s.replies / s.sent : 0,
  }));
  variantStats.sort((a, b) => b.replyRate - a.replyRate);
  const winningFollowUpVariant =
    variantStats.find((v) => v.sent >= 3 && v.variant !== "unknown")?.variant ||
    null;

  const lessons: string[] = [];
  if (followUpReplyShare >= 0.4) {
    lessons.push(
      "Many replies arrive after follow-ups — keep bumps short, threaded, and easy to answer with one line."
    );
  }
  if (referralCount >= 2) {
    lessons.push(
      "Professors often decline supervision but suggest alternatives (open-source, programs, other labs). Soften asks and invite a referral or entry path."
    );
  }
  if (interestedCount >= 1) {
    lessons.push(
      "When interested, replies tend to reward specific paper hooks and concrete remote tasks — keep citing one real paper and offering 2–3 labeled experience bullets."
    );
  }
  if (winningFollowUpVariant === "short_bump") {
    lessons.push(
      "A/B: short follow-up bumps are currently outperforming longer value nudges — prefer brevity on follow-ups."
    );
  } else if (winningFollowUpVariant === "value_nudge") {
    lessons.push(
      "A/B: value-add follow-ups are currently outperforming short bumps — include one new useful angle on follow-ups."
    );
  }
  if (declineCount > interestedCount + referralCount && sampleSize >= 10) {
    lessons.push(
      "Decline-heavy so far: tighten targeting (fit score), lead with remote contribution, and avoid sounding like an admissions pitch."
    );
  }
  if (!lessons.length) {
    lessons.push(
      "Not enough reply data yet — keep emails short, paper-specific, and threaded follow-ups short."
    );
  }

  const promptBrief = [
    "PERFORMANCE LEARNINGS FROM PAST REPLIES (optimize for reply chance):",
    ...lessons.map((l) => `- ${l}`),
    followUpReplyShare >= 0.3
      ? "- Expect follow-ups to drive replies; first email should still stand alone but stay skimmable."
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const payload: OutreachLearnings = {
    updatedAt: new Date().toISOString(),
    sampleSize,
    replyRate,
    interestedCount,
    referralCount,
    declineCount,
    followUpReplyShare,
    winningFollowUpVariant,
    variantStats,
    lessons,
    promptBrief,
  };

  await prisma.studentProfile.update({
    where: { userId },
    data: { outreachLearningsJson: JSON.stringify(payload) },
  });

  return payload;
}

export async function getOutreachLearnings(
  userId: string
): Promise<OutreachLearnings | null> {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { outreachLearningsJson: true },
  });
  if (!profile?.outreachLearningsJson) return null;
  try {
    return JSON.parse(profile.outreachLearningsJson) as OutreachLearnings;
  } catch {
    return null;
  }
}
