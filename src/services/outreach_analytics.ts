/**
 * Outreach analytics: reply rates, A/B follow-up arms, sentiment mix.
 */
import { prisma } from "@/lib/prisma";
import {
  getOutreachLearnings,
  refreshOutreachLearnings,
} from "@/services/outreach_learning";

export async function getOutreachAnalytics(userId: string) {
  const [sentRows, insights, scheduled, learnings] = await Promise.all([
    prisma.sentHistory.findMany({
      where: { userId },
      select: {
        kind: true,
        variant: true,
        replyDetected: true,
        sentAt: true,
        university: true,
      },
    }),
    prisma.replyInsight.findMany({
      where: { userId },
      select: {
        id: true,
        sentiment: true,
        replyToKind: true,
        status: true,
        createdAt: true,
        headline: true,
        professorName: true,
        university: true,
        professorEmail: true,
        recommendation: true,
        rawReply: true,
        opportunitiesJson: true,
        linksJson: true,
        replyToSubject: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.scheduledEmail.count({
      where: { userId, status: "scheduled" },
    }),
    getOutreachLearnings(userId),
  ]);

  const sent = sentRows.length;
  const replied = sentRows.filter((r) => r.replyDetected).length;
  const outreachSent = sentRows.filter((r) => r.kind === "outreach").length;
  const followUpSent = sentRows.filter((r) => r.kind === "follow_up").length;
  const outreachReplied = sentRows.filter(
    (r) => r.kind === "outreach" && r.replyDetected
  ).length;
  const followUpReplied = sentRows.filter(
    (r) => r.kind === "follow_up" && r.replyDetected
  ).length;

  const byVariant: Record<
    string,
    { sent: number; replies: number; replyRate: number }
  > = {};
  for (const row of sentRows.filter((r) => r.kind === "follow_up")) {
    const key = row.variant || "unlabeled";
    if (!byVariant[key]) byVariant[key] = { sent: 0, replies: 0, replyRate: 0 };
    byVariant[key].sent += 1;
    if (row.replyDetected) byVariant[key].replies += 1;
  }
  for (const key of Object.keys(byVariant)) {
    const v = byVariant[key];
    v.replyRate = v.sent ? v.replies / v.sent : 0;
  }

  const sentiment = {
    interested: insights.filter((i) => i.sentiment === "interested").length,
    referral: insights.filter((i) => i.sentiment === "referral").length,
    decline: insights.filter((i) => i.sentiment === "decline").length,
    question: insights.filter((i) => i.sentiment === "question").length,
    neutral: insights.filter((i) => i.sentiment === "neutral").length,
  };

  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentSent = sentRows.filter((r) => r.sentAt >= last30).length;
  const recentReplied = sentRows.filter(
    (r) => r.sentAt >= last30 && r.replyDetected
  ).length;

  return {
    summary: {
      sent,
      replied,
      replyRate: sent ? replied / sent : 0,
      outreachSent,
      outreachReplyRate: outreachSent ? outreachReplied / outreachSent : 0,
      followUpSent,
      followUpReplyRate: followUpSent ? followUpReplied / followUpSent : 0,
      scheduledPending: scheduled,
      last30Sent: recentSent,
      last30ReplyRate: recentSent ? recentReplied / recentSent : 0,
      opportunitiesOpen: insights.filter((i) => i.status === "new").length,
    },
    abTests: {
      followUpVariants: byVariant,
      note: "Follow-ups randomly assign short_bump vs value_nudge and stay on the original Gmail thread.",
    },
    sentiment,
    recentInsights: insights.slice(0, 10),
    learnings: learnings || (await refreshOutreachLearnings(userId)),
  };
}
