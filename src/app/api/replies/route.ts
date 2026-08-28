import { NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { syncRepliesForUser } from "@/services/reply_tracker";

export async function GET() {
  return withAuthUser(async (user) => {
    const items = await prisma.sentHistory.findMany({
      where: { userId: user.id },
      orderBy: [{ replyDetected: "desc" }, { sentAt: "desc" }],
      take: 100,
    });
    const replied = items.filter((i) => i.replyDetected).length;
    return NextResponse.json({
      items,
      count: items.length,
      replied,
      awaiting: items.length - replied,
    });
  });
}

export async function POST() {
  return withAuthUser(async (user) => {
    if (!user.gmailConnected) {
      return NextResponse.json(
        { error: "Connect Gmail with read access first." },
        { status: 400 }
      );
    }
    try {
      const result = await syncRepliesForUser(user.id);
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Sync failed" },
        { status: 400 }
      );
    }
  });
}
