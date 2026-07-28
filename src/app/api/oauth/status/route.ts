/**
 * Returns whether Google OAuth is configured for Connect Gmail.
 * Safe to expose — does not leak secrets.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET
  );
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    (process.env.NEXTAUTH_URL
      ? `${process.env.NEXTAUTH_URL.replace(/\/$/, "")}/api/auth/callback/google`
      : null);

  return NextResponse.json({
    googleOAuthConfigured: configured,
    redirectUri,
    nextAuthUrl: process.env.NEXTAUTH_URL || null,
    liveAppUrl:
      process.env.NEXT_PUBLIC_LIVE_APP_URL ||
      "https://scholarreach-ai.vercel.app",
  });
}
