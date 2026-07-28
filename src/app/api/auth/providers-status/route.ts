import { NextResponse } from "next/server";

/** Public OAuth availability — no secrets */
export async function GET() {
  return NextResponse.json({
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    microsoft: !!(
      process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET
    ),
    googleRedirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      (process.env.NEXTAUTH_URL
        ? `${process.env.NEXTAUTH_URL.replace(/\/$/, "")}/api/auth/callback/google`
        : null),
    note:
      "Google Sign-In uses identity scopes only (Family Link friendly). Gmail send is connected separately.",
  });
}
