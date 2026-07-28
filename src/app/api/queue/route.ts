import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dripDispatcher } from "@/services/drip_dispatcher";
import { withAuthUser } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  return withAuthUser(async (user) => {
    const status = new URL(req.url).searchParams.get("status");

    const items = await prisma.scheduledEmail.findMany({
      where: {
        userId: user.id,
        ...(status ? { status } : {}),
      },
      include: { professor: true },
      orderBy: [{ status: "asc" }, { scheduledIso: "asc" }],
    });

    return NextResponse.json({ items, count: items.length });
  });
}

export async function PATCH(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json();
    const { id, scheduledIso, action } = body as {
      id: string;
      scheduledIso?: string;
      action?: "dispatch_now" | "cancel" | "reschedule";
    };

    const item = await prisma.scheduledEmail.findFirst({
      where: { id, userId: user.id },
    });
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (action === "cancel") {
      const updated = await prisma.scheduledEmail.update({
        where: { id },
        data: { status: "cancelled" },
      });
      return NextResponse.json({ item: updated });
    }

    if (action === "dispatch_now") {
      const updated = await prisma.scheduledEmail.update({
        where: { id },
        data: {
          scheduledIso: new Date(),
          scheduledTime: "Dispatch override — next drip tick",
          status: "scheduled",
        },
      });
      const result = await dripDispatcher.processNextQueueItem(user.id);
      return NextResponse.json({ item: updated, dispatchResult: result });
    }

    if (action === "reschedule" && scheduledIso) {
      const slot = new Date(scheduledIso);
      const updated = await prisma.scheduledEmail.update({
        where: { id },
        data: {
          scheduledIso: slot,
          scheduledTime: dripDispatcher.formatSlot(slot),
          status: "scheduled",
        },
      });
      return NextResponse.json({ item: updated });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  });
}

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json().catch(() => ({}));

    if (body.action === "dispatch_batch") {
      const results = [];
      for (let i = 0; i < 5; i++) {
        const r = await dripDispatcher.processNextQueueItem(user.id);
        results.push(r);
        if (r.skipped && r.reason === "empty_queue") break;
      }
      return NextResponse.json({ results });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  });
}
