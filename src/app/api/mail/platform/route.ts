import { NextRequest, NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isPlatformMailConfigured } from "@/services/platform_mail";

export async function GET() {
  return withAuthUser(async (user) => {
    return NextResponse.json({
      configured: isPlatformMailConfigured(),
      connected:
        user.mailProvider === "platform" && !!user.mailConnected,
      mailProvider: user.mailProvider,
      replyTo: user.email,
      fromHint: process.env.RESEND_FROM || null,
      note: "Scalable transactional send. Professors see the platform From address; replies go to your email.",
    });
  });
}

/** Enable / disable platform (Resend) sending for this user */
export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json().catch(() => ({}));
    const enable = body.enable !== false;

    if (enable && !isPlatformMailConfigured()) {
      return NextResponse.json(
        {
          error:
            "Platform mail is not set up on this deploy yet. Add RESEND_API_KEY + RESEND_FROM (verified domain) on Vercel.",
          setupRequired: true,
        },
        { status: 503 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: enable
        ? {
            mailProvider: "platform",
            mailConnected: true,
            gmailConnected: false,
          }
        : {
            mailProvider:
              user.mailProvider === "platform" ? null : user.mailProvider,
            mailConnected:
              user.mailProvider === "platform" ? false : user.mailConnected,
          },
    });

    return NextResponse.json({
      ok: true,
      mailProvider: enable ? "platform" : null,
      connected: enable,
      replyTo: user.email,
    });
  });
}
