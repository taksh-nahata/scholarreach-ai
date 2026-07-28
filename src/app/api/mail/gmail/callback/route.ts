import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const err = req.nextUrl.searchParams.get("error");
  const base = (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_LIVE_APP_URL ||
    req.nextUrl.origin
  ).replace(/\/$/, "");

  if (err) {
    return NextResponse.redirect(
      `${base}/connect-inbox?error=${encodeURIComponent(err)}`
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(`${base}/connect-inbox?error=missing_code`);
  }

  const redirectUri = `${base}/api/mail/gmail/callback`;
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID || "",
    process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri
  );

  try {
    const { tokens } = await client.getToken(code);
    await prisma.user.update({
      where: { id: state },
      data: {
        googleAccessToken: tokens.access_token || null,
        googleRefreshToken: tokens.refresh_token || undefined,
        googleTokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
        gmailConnected: true,
        mailConnected: true,
        mailProvider: "gmail",
      },
    });
    return NextResponse.redirect(`${base}/connect-inbox?connected=gmail`);
  } catch {
    return NextResponse.redirect(
      `${base}/connect-inbox?error=token_exchange_failed`
    );
  }
}
