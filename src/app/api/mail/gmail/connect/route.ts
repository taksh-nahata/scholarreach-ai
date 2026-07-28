import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { withAuthUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
];

function oauthClient(redirectUri: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID || "",
    process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri
  );
}

function redirectBase(req: NextRequest) {
  const env = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_LIVE_APP_URL;
  if (env) return env.replace(/\/$/, "");
  return req.nextUrl.origin;
}

/** Start Gmail connect (separate from Sign in with Google — Family Link friendly split) */
export async function GET(req: NextRequest) {
  return withAuthUser(async (user) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        {
          error:
            "Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server.",
          setupRequired: true,
        },
        { status: 503 }
      );
    }

    const base = redirectBase(req);
    const redirectUri = `${base}/api/mail/gmail/callback`;
    const client = oauthClient(redirectUri);
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: GMAIL_SCOPES,
      include_granted_scopes: true,
      login_hint: user.email,
      state: user.id,
    });

    return NextResponse.json({
      url,
      redirectUri,
      familyLinkTip:
        "If Google blocks sensitive Gmail scopes on a Family Link account, use Connect inbox → Gmail App Password instead (parent can allow app passwords).",
    });
  });
}
