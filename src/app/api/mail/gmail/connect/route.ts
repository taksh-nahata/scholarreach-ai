import { NextRequest, NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import { createGmailOAuthState } from "@/lib/oauth_state";
import {
  GMAIL_SEND_SCOPES,
  createOAuthClient,
  isGoogleOAuthConfigured,
  mailRedirectUri,
} from "@/services/gmail_oauth_service";

function redirectBase(req: NextRequest) {
  const env = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_LIVE_APP_URL;
  if (env) return env.replace(/\/$/, "");
  return req.nextUrl.origin;
}

/**
 * Start Gmail access request.
 * Login uses basic info only; this step asks for send + read so mail goes
 * From: the student's Gmail and replies can be tracked.
 */
export async function GET(req: NextRequest) {
  return withAuthUser(async (user) => {
    if (!isGoogleOAuthConfigured()) {
      return NextResponse.json(
        {
          error:
            "Google OAuth is not configured on the server yet (missing CLIENT_ID/SECRET).",
          setupRequired: true,
          redirectUris: {
            login: `${redirectBase(req)}/api/auth/callback/google`,
            gmail: mailRedirectUri(redirectBase(req)),
          },
        },
        { status: 503 }
      );
    }

    const base = redirectBase(req);
    const redirectUri = mailRedirectUri(base);
    const client = createOAuthClient(redirectUri);
    const url = client.generateAuthUrl({
      access_type: "offline",
      // Always force consent so Google issues a NEW refresh token after invalid_grant
      prompt: "consent",
      scope: GMAIL_SEND_SCOPES,
      include_granted_scopes: false,
      login_hint: user.email,
      state: createGmailOAuthState(user.id),
    });

    return NextResponse.json({
      url,
      redirectUri,
      scopes: GMAIL_SEND_SCOPES,
      tip: "Login uses basic profile info only. This step requests Gmail send + read. Supervised accounts may need guardian approval when Google prompts.",
    });
  });
}
