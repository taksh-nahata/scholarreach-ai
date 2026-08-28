import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { parseGmailOAuthState } from "@/lib/oauth_state";

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

  const parsed = parseGmailOAuthState(state);
  if (!parsed?.userId) {
    return NextResponse.redirect(`${base}/connect-inbox?error=invalid_state`);
  }

  const redirectUri = `${base}/api/mail/gmail/callback`;
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID || "",
    process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri
  );

  try {
    const { tokens } = await client.getToken(code);
    const existing = await prisma.user.findUnique({
      where: { id: parsed.userId },
      select: { googleRefreshToken: true, gmailConnected: true },
    });

    // After invalid_grant we wipe refresh tokens. Do NOT fall back to a dead one.
    // Google returns refresh_token when prompt=consent (our connect flow).
    const refresh = tokens.refresh_token || existing?.googleRefreshToken || null;
    if (!refresh) {
      return NextResponse.redirect(
        `${base}/connect-inbox?error=no_refresh_token`
      );
    }
    if (!tokens.access_token) {
      return NextResponse.redirect(
        `${base}/connect-inbox?error=no_access_token`
      );
    }

    await prisma.user.update({
      where: { id: parsed.userId },
      data: {
        googleAccessToken: tokens.access_token,
        googleRefreshToken: refresh,
        googleTokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : new Date(Date.now() + 55 * 60 * 1000),
        gmailConnected: true,
        mailConnected: true,
        mailProvider: "gmail",
      },
    });

    // Smoke-test the new credentials immediately
    try {
      client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: refresh,
        expiry_date: tokens.expiry_date || undefined,
      });
      const probe = google.gmail({ version: "v1", auth: client });
      await probe.users.getProfile({ userId: "me" });
    } catch {
      await prisma.user.update({
        where: { id: parsed.userId },
        data: {
          gmailConnected: false,
          googleAccessToken: null,
          googleRefreshToken: null,
          googleTokenExpiry: null,
        },
      });
      return NextResponse.redirect(
        `${base}/connect-inbox?error=gmail_probe_failed`
      );
    }

    await prisma.scheduledEmail.updateMany({
      where: {
        userId: parsed.userId,
        status: "scheduled",
        OR: [
          { lastError: { contains: "invalid_grant" } },
          { lastError: { contains: "Gmail authorization expired" } },
          { lastError: { contains: "Reconnect Gmail" } },
        ],
      },
      data: { lastError: null },
    });

    return NextResponse.redirect(`${base}/connect-inbox?connected=gmail`);
  } catch {
    return NextResponse.redirect(
      `${base}/connect-inbox?error=token_exchange_failed`
    );
  }
}
