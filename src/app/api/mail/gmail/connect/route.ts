import { NextRequest, NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
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
 * Start Gmail access request (same idea as Apps Script authorizing GmailApp).
 * Login uses basic info only; this step separately asks for gmail.send so mail
 * goes From: the student's Gmail.
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
      prompt: "consent",
      scope: GMAIL_SEND_SCOPES,
      include_granted_scopes: true,
      login_hint: user.email,
      state: user.id,
    });

    return NextResponse.json({
      url,
      redirectUri,
      scopes: GMAIL_SEND_SCOPES,
      familyLinkTip:
        "Family Link 'basic info' covers login only. This step asks for Gmail send — your parent may need to approve when Google prompts (Ask every time).",
    });
  });
}
