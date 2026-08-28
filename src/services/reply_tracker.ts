/**
 * Scan Gmail for replies to outbound outreach + follow-up threads.
 * Parses referrals, links, and opportunities even on polite declines.
 */
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { loadUserOAuthClient } from "@/services/gmail_oauth_service";
import { parseJsonField } from "@/services/profile_service";
import { cancelPendingFollowUpsForSent } from "@/services/follow_up_scheduler";
import {
  looksLikeUnsubscribe,
  suppressEmail,
} from "@/services/email_suppression";
import {
  extractPlainBodyFromPayload,
  trimReplyQuotes,
} from "@/services/gmail_body";
import { saveReplyInsight } from "@/services/reply_processor";
import { refreshOutreachLearnings } from "@/services/outreach_learning";

function headerValue(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string
) {
  const h = (headers || []).find(
    (x) => (x.name || "").toLowerCase() === name.toLowerCase()
  );
  return h?.value || "";
}

function parseFromAddress(from: string): string {
  return (from.match(/[\w.+-]+@[\w.-]+/) || [])[0]?.toLowerCase() || "";
}

async function recordAchievement(
  userId: string,
  entry: { title: string; detail: string }
) {
  const profile = await prisma.studentProfile.findUnique({ where: { userId } });
  if (!profile) return;
  const list = parseJsonField<Array<Record<string, unknown>>>(
    profile.achievementsJson,
    []
  );
  const exists = list.some(
    (a) => String(a.title) === entry.title && String(a.detail) === entry.detail
  );
  if (exists) return;
  list.unshift({
    title: entry.title,
    detail: entry.detail,
    year: new Date().getFullYear(),
    source: "reply_tracker",
  });
  await prisma.studentProfile.update({
    where: { userId },
    data: { achievementsJson: JSON.stringify(list.slice(0, 40)) },
  });
}

type ThreadContext = {
  row: {
    id: string;
    toEmail: string;
    professorName: string | null;
    university: string | null;
    subject: string;
    kind: string;
    gmailMessageId: string | null;
    gmailThreadId: string | null;
    replyDetected: boolean;
  };
  threadId: string;
};

async function resolveThreadContexts(
  userId: string,
  gmail: ReturnType<typeof google.gmail>,
  limit: number
): Promise<ThreadContext[]> {
  const rows = await prisma.sentHistory.findMany({
    where: {
      userId,
      sentAt: { gte: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { sentAt: "desc" },
    take: limit * 2,
    select: {
      id: true,
      toEmail: true,
      professorName: true,
      university: true,
      subject: true,
      kind: true,
      gmailMessageId: true,
      gmailThreadId: true,
      replyDetected: true,
    },
  });

  const byThread = new Map<string, ThreadContext>();

  for (const row of rows) {
    let threadId = row.gmailThreadId;
    if (!threadId && row.gmailMessageId && !row.gmailMessageId.startsWith("dryrun_")) {
      try {
        const msg = await gmail.users.messages.get({
          userId: "me",
          id: row.gmailMessageId,
          format: "minimal",
        });
        threadId = msg.data.threadId || null;
        if (threadId) {
          await prisma.sentHistory.update({
            where: { id: row.id },
            data: { gmailThreadId: threadId },
          });
        }
      } catch {
        /* ignore */
      }
    }
    if (!threadId) continue;

    const existing = byThread.get(threadId);
    if (!existing || row.kind === "follow_up") {
      byThread.set(threadId, { row, threadId });
    }
  }

  return [...byThread.values()].slice(0, limit);
}

export async function syncRepliesForUser(userId: string, limit = 50) {
  const { client, user } = await loadUserOAuthClient(userId);
  const gmail = google.gmail({ version: "v1", auth: client });

  const contexts = await resolveThreadContexts(userId, gmail, limit);
  let found = 0;
  let insightsCreated = 0;
  const hits: Array<{
    id: string;
    from: string;
    snippet: string;
    kind: string;
    sentiment?: string;
  }> = [];

  for (const ctx of contexts) {
    const { row, threadId } = ctx;

    await prisma.sentHistory.updateMany({
      where: { userId, gmailThreadId: threadId },
      data: { lastReplyCheck: new Date() },
    });

    try {
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      });

      const messages = thread.data.messages || [];
      const professorEmail = row.toEmail.toLowerCase();
      const userEmail = user.email?.toLowerCase() || "";

      const existingInsights = await prisma.replyInsight.findMany({
        where: { userId, gmailThreadId: threadId },
        select: { gmailMessageId: true },
      });
      const processedIds = new Set(
        existingInsights.map((i) => i.gmailMessageId).filter(Boolean) as string[]
      );

      for (const msg of messages) {
        if (!msg.id || processedIds.has(msg.id)) continue;

        const headers = msg.payload?.headers;
        const from = headerValue(headers, "From");
        const fromAddr = parseFromAddress(from);
        if (!fromAddr || fromAddr === userEmail) continue;

        const isProfessor =
          fromAddr === professorEmail ||
          fromAddr.split("@")[1] === professorEmail.split("@")[1];

        if (!isProfessor) continue;

        const rawBody = trimReplyQuotes(
          extractPlainBodyFromPayload(msg.payload)
        );
        const snippet = (rawBody || msg.snippet || "").slice(0, 280);
        if (!snippet.trim()) continue;

        const saved = await saveReplyInsight({
          userId,
          sentHistoryId: row.id,
          gmailMessageId: msg.id,
          gmailThreadId: threadId,
          professorName: row.professorName,
          university: row.university,
          professorEmail: professorEmail,
          replyToKind: row.kind,
          replyToSubject: row.subject,
          rawReply: rawBody || snippet,
        });

        if (saved.created) insightsCreated += 1;
        processedIds.add(msg.id);

        await prisma.sentHistory.updateMany({
          where: { userId, gmailThreadId: threadId },
          data: {
            replyDetected: true,
            replyAt: new Date(),
            replySnippet: snippet,
            replyFrom: fromAddr,
            replyBody: (rawBody || snippet).slice(0, 12_000),
            lastProcessedReplyId: msg.id,
            replyCount: { increment: 1 },
          },
        });

        // Same professor may have outreach + follow-up on different threads
        // (legacy non-threaded follow-ups). Mark all of their rows.
        await prisma.sentHistory.updateMany({
          where: {
            userId,
            toEmail: professorEmail,
            replyDetected: false,
          },
          data: {
            replyDetected: true,
            replyAt: new Date(),
            replySnippet: snippet,
            replyFrom: fromAddr,
            replyBody: (rawBody || snippet).slice(0, 12_000),
            lastProcessedReplyId: msg.id,
          },
        });

        const outreachRow = await prisma.sentHistory.findFirst({
          where: { userId, gmailThreadId: threadId, kind: "outreach" },
          select: { id: true },
        });
        if (outreachRow) {
          await cancelPendingFollowUpsForSent(userId, outreachRow.id, professorEmail);
        }

        if (looksLikeUnsubscribe(rawBody || snippet)) {
          await suppressEmail({
            userId,
            email: professorEmail,
            reason: "Professor asked to stop contact",
            source: "reply",
          });
        }

        await recordAchievement(userId, {
          title: saved.insight.headline,
          detail: row.university
            ? `${row.professorName || professorEmail} · ${row.university}`
            : row.professorName || professorEmail,
        });

        found += 1;
        hits.push({
          id: row.id,
          from: fromAddr,
          snippet,
          kind: row.kind,
          sentiment: saved.insight.sentiment,
        });
      }
    } catch (err) {
      console.warn(
        `[ReplySync] ${row.toEmail}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  if (insightsCreated > 0) {
    try {
      await refreshOutreachLearnings(userId);
    } catch (err) {
      console.warn(
        "[ReplySync] learnings refresh failed:",
        err instanceof Error ? err.message : err
      );
    }
  }

  return { checked: contexts.length, found, insightsCreated, hits };
}

export async function syncRepliesForAllConnectedUsers(userLimit = 15) {
  const users = await prisma.user.findMany({
    where: { gmailConnected: true },
    select: { id: true, email: true },
    take: Math.min(userLimit, 30),
  });
  const summary = [];
  for (const u of users) {
    try {
      const r = await syncRepliesForUser(u.id, 40);
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
