import { prisma } from "@/lib/prisma";
import { parseProfessorReply } from "@/services/reply_parser";
import { researchLinks } from "@/services/link_researcher";

export async function saveReplyInsight(opts: {
  userId: string;
  sentHistoryId?: string | null;
  gmailMessageId: string;
  gmailThreadId?: string | null;
  professorName?: string | null;
  university?: string | null;
  professorEmail?: string | null;
  replyToKind?: string | null;
  replyToSubject?: string | null;
  rawReply: string;
}) {
  const existing = await prisma.replyInsight.findFirst({
    where: {
      userId: opts.userId,
      gmailMessageId: opts.gmailMessageId,
    },
  });
  if (existing) return { insight: existing, created: false };

  const parsed = parseProfessorReply(opts.rawReply, {
    professorName: opts.professorName,
  });

  const researched = await researchLinks(
    parsed.links.map((l) => l.url),
    4
  );

  const insight = await prisma.replyInsight.create({
    data: {
      userId: opts.userId,
      sentHistoryId: opts.sentHistoryId || null,
      gmailMessageId: opts.gmailMessageId,
      gmailThreadId: opts.gmailThreadId || null,
      professorName: opts.professorName || null,
      university: opts.university || null,
      professorEmail: opts.professorEmail || null,
      replyToKind: opts.replyToKind || null,
      replyToSubject: opts.replyToSubject || null,
      sentiment: parsed.sentiment,
      headline: parsed.headline,
      recommendation: parsed.recommendation,
      opportunitiesJson: JSON.stringify(parsed.opportunities),
      linksJson: JSON.stringify(researched),
      rawReply: opts.rawReply.slice(0, 12_000),
      status: "new",
    },
  });

  return { insight, created: true, parsed };
}
