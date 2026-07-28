import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireUser();

  const [professors, draftsPending, scheduled, sent, sentHistory] = await Promise.all([
    prisma.professor.count({ where: { userId: user.id } }),
    prisma.draft.count({ where: { userId: user.id, status: "pending" } }),
    prisma.scheduledEmail.count({ where: { userId: user.id, status: "scheduled" } }),
    prisma.scheduledEmail.count({ where: { userId: user.id, status: "sent" } }),
    prisma.sentHistory.count({ where: { userId: user.id } }),
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
  });
}
