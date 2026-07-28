/**
 * ScholarReach AI — Gmail OAuth2 Service
 * One-click Google OAuth with gmail.send scope. Stores tokens per-user in DB.
 */
import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
  "profile",
];

export function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID || "",
    process.env.GOOGLE_CLIENT_SECRET || "",
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3001/api/auth/callback/google"
  );
}

export function getGmailAuthUrl(state?: string) {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: state || undefined,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export async function loadUserOAuthClient(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.googleRefreshToken && !user?.googleAccessToken) {
    throw new Error("Gmail OAuth2 is not authorized. Please click Connect Gmail.");
  }

  const client = createOAuthClient();
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
  pdfPath,
  fromName,
  fromEmail,
}: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  pdfPath?: string;
  fromName?: string;
  fromEmail?: string;
}) {
  const boundary = `__scholarreach_${Date.now()}__`;
  const sender = fromEmail || "me";
  const display = fromName || "ScholarReach User";

  const headers = [
    `From: ${display} <${sender}>`,
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];

  const parts: string[] = [];
  parts.push(headers.join("\r\n"));
  parts.push("");
  parts.push(`--${boundary}`);
  parts.push("Content-Type: text/html; charset=UTF-8");
  parts.push("Content-Transfer-Encoding: 7bit");
  parts.push("");

  const formattedBody =
    htmlBody ||
    `<div style="font-family: -apple-system, sans-serif; font-size: 14.5px; color: #222; line-height: 1.6;">${body.replace(
      /\n/g,
      "<br>"
    )}</div>`;
  parts.push(formattedBody);

  if (pdfPath && fs.existsSync(pdfPath)) {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfBase64 = pdfBytes.toString("base64");
    const filename = path.basename(pdfPath);
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: application/pdf; name="${filename}"`);
    parts.push(`Content-Disposition: attachment; filename="${filename}"`);
    parts.push("Content-Transfer-Encoding: base64");
    parts.push("");
    parts.push(pdfBase64);
  }

  parts.push(`--${boundary}--`);

  return Buffer.from(parts.join("\r\n"))
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
    pdfPath?: string;
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
  return !!(user?.gmailConnected && (user.googleAccessToken || user.googleRefreshToken));
}
