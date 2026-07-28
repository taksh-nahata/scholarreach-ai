/**
 * ScholarReach AI — Gmail OAuth2 (send from the student's real Gmail).
 * Uses gmail.send only — narrower scopes help Family Link parent approval.
 */
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

/** Scopes for Connect Gmail — personal From: address via Gmail API */
export const GMAIL_SEND_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
];

export function mailRedirectUri(base?: string) {
  const root = (
    base ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_LIVE_APP_URL ||
    "http://localhost:3001"
  ).replace(/\/$/, "");
  return `${root}/api/mail/gmail/callback`;
}

export function authRedirectUri(base?: string) {
  const root = (
    base ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_LIVE_APP_URL ||
    "http://localhost:3001"
  ).replace(/\/$/, "");
  return `${root}/api/auth/callback/google`;
}

export function createOAuthClient(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID || "",
    process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri || mailRedirectUri()
  );
}

export function isGoogleOAuthConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export async function loadUserOAuthClient(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.googleRefreshToken && !user?.googleAccessToken) {
    throw new Error(
      "Gmail is not connected. Open Connect Inbox and approve Google (parent may need to approve in Family Link)."
    );
  }

  const client = createOAuthClient(mailRedirectUri());
  client.setCredentials({
    access_token: user.googleAccessToken || undefined,
    refresh_token: user.googleRefreshToken || undefined,
    expiry_date: user.googleTokenExpiry?.getTime(),
  });

  client.on("tokens", async (tokens) => {
    await prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessToken: tokens.access_token || user.googleAccessToken,
        googleRefreshToken: tokens.refresh_token || user.googleRefreshToken,
        googleTokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : user.googleTokenExpiry,
        gmailConnected: true,
        mailConnected: true,
        mailProvider: "gmail",
      },
    });
  });

  return { client, user };
}

function createRfcMessage({
  to,
  cc,
  subject,
  body,
  htmlBody,
  fromName,
  fromEmail,
}: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  fromName?: string;
  fromEmail: string;
}) {
  const boundary = `sr_${Date.now()}`;
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]
    .filter(Boolean)
    .join("\r\n");

  const textPart = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  ].join("\r\n");

  const html =
    htmlBody ||
    `<div style="font-family:sans-serif;white-space:pre-wrap">${body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</div>`;

  const htmlPart = [
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
    `--${boundary}--`,
  ].join("\r\n");

  const raw = `${headers}\r\n\r\n${textPart}\r\n${htmlPart}`;
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendGmailForUser(
  userId: string,
  opts: {
    to: string;
    cc?: string;
    subject: string;
    body: string;
    htmlBody?: string;
  }
) {
  const { client, user } = await loadUserOAuthClient(userId);
  const gmail = google.gmail({ version: "v1", auth: client });
  const raw = createRfcMessage({
    ...opts,
    fromName: user.name || undefined,
    fromEmail: user.email,
  });

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return res.data;
}

export async function isUserGmailConnected(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return !!(
    user?.gmailConnected &&
    (user.googleAccessToken || user.googleRefreshToken)
  );
}
