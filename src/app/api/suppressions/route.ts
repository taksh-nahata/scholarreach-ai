import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuthUser } from "@/lib/api-auth";
import { suppressEmail } from "@/services/email_suppression";

export async function GET() {
  return withAuthUser(async (user) => {
    const items = await prisma.emailSuppression.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ items });
  });
}

const bodySchema = z.object({
  email: z.string().email(),
  reason: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    const row = await suppressEmail({
      userId: user.id,
      email: parsed.data.email,
      reason: parsed.data.reason || "Manual suppression",
      source: "manual",
    });
    // Cancel pending scheduled emails to this address
    await prisma.scheduledEmail.updateMany({
      where: {
        userId: user.id,
        toEmail: parsed.data.email.toLowerCase(),
        status: { in: ["scheduled", "sending"] },
      },
      data: {
        status: "cancelled",
        lastError: "Suppressed — do not contact",
      },
    });
    return NextResponse.json({ ok: true, item: row });
  });
}

export async function DELETE(req: NextRequest) {
  return withAuthUser(async (user) => {
    const email = new URL(req.url).searchParams.get("email")?.toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }
    await prisma.emailSuppression.deleteMany({
      where: { userId: user.id, email },
    });
    return NextResponse.json({ ok: true });
  });
}
