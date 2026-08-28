import { NextRequest, NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  return withAuthUser(async (user) => {
    const items = await prisma.replyInsight.findMany({
      where: { userId: user.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
    });

    const counts = {
      new: items.filter((i) => i.status === "new").length,
      referral: items.filter((i) => i.sentiment === "referral").length,
      interested: items.filter((i) => i.sentiment === "interested").length,
    };

    return NextResponse.json({ items, counts, count: items.length });
  });
}

export async function PATCH(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "");
    const status = String(body.status || "");
    if (!id || !["reviewed", "actioned", "dismissed", "new"].includes(status)) {
      return NextResponse.json({ error: "Invalid id or status" }, { status: 400 });
    }
    const updated = await prisma.replyInsight.updateMany({
      where: { id, userId: user.id },
      data: { status },
    });
    if (!updated.count) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  });
}
