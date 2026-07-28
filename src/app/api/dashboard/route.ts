import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();

    const [professors, draftsPending, scheduled, sent, sentHistory, recentQueue] =
      await Promise.all([
        prisma.professor.count({ where: { userId: user.id } }),
        prisma.draft.count({ where: { userId: user.id, status: "pending" } }),
        prisma.scheduledEmail.count({
          where: { userId: user.id, status: "scheduled" },
        }),
        prisma.scheduledEmail.count({
          where: { userId: user.id, status: "sent" },
        }),
        prisma.sentHistory.count({ where: { userId: user.id } }),
        prisma.scheduledEmail.findMany({
          where: { userId: user.id },
          orderBy: [{ status: "asc" }, { scheduledIso: "asc" }],
          take: 8,
          select: {
            id: true,
            professorName: true,
            university: true,
            toEmail: true,
            subject: true,
            scheduledIso: true,
            scheduledTime: true,
            status: true,
          },
        }),
      ]);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        gmailConnected: user.gmailConnected,
        dailySentCount: user.dailySentCount,
      },
      metrics: {
        totalLeads: professors,
        pendingApprovals: draftsPending,
        scheduledSends: scheduled,
        emailsDelivered: sent,
        contacted: sentHistory,
        openReplyRate: null,
      },
      queue: recentQueue.map((item) => ({
        ...item,
        scheduledIso: item.scheduledIso?.toISOString?.() || item.scheduledIso,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    if (/Unauthorized/i.test(message)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
