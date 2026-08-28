/**
 * ScholarReach AI — Gmail OAuth2 (send from the student's real Gmail + read for replies).
 */
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

/** Scopes: send from student Gmail + read inbox for reply tracking */
export const GMAIL_SEND_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
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
      "Gmail is not connected. Open Connect Inbox and grant Gmail access."
    );
  }

  const client = createOAuthClient(mailRedirectUri());
  client.setCredentials({
    access_token: user.googleAccessToken || undefined,
    refresh_token: user.googleRefreshToken || undefined,
    expiry_date: user.googleTokenExpiry?.getTime(),
  });

  client.on("tokens", async (tokens) => {
    const fresh = await prisma.user.findUnique({ where: { id: userId } });
    await prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessToken: tokens.access_token || fresh?.googleAccessToken,
        // Google often omits refresh_token on refresh — never wipe the stored one
        googleRefreshToken:
          tokens.refresh_token || fresh?.googleRefreshToken || undefined,
        googleTokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : fresh?.googleTokenExpiry,
        gmailConnected: true,
        mailConnected: true,
        mailProvider: "gmail",
      },
    });
  });

  return { client, user };
}

export function isInvalidGrantError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const anyErr = err as {
    response?: { data?: { error?: string } };
    code?: string;
  };
  return (
    /invalid_grant/i.test(msg) ||
    anyErr?.response?.data?.error === "invalid_grant" ||
    anyErr?.code === "invalid_grant"
  );
}

/** Mark Gmail as needing a fresh Google consent (refresh token dead). */
export async function markGmailNeedsReconnect(
  userId: string,
  detail?: string
) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      gmailConnected: false,
      // Wipe dead tokens so reconnect cannot reuse an invalid_grant refresh token
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiry: null,
    },
  });
  return (
    `Gmail authorization expired (invalid_grant). ` +
    `Open Connect Inbox → Reconnect Gmail access, then sends will resume. ` +
    (detail ? `(${detail.slice(0, 120)})` : "")
  ).trim();
}

/**
 * Force a token refresh now. Throws a reconnect-friendly error on invalid_grant.
 */
export async function ensureGmailAccessToken(userId: string) {
  const { client, user } = await loadUserOAuthClient(userId);
  try {
    const token = await client.getAccessToken();
    if (!token?.token) {
      throw new Error("Could not refresh Gmail access token");
    }
    return { client, user, accessToken: token.token };
  } catch (err) {
    if (isInvalidGrantError(err)) {
      const message = await markGmailNeedsReconnect(
        userId,
        err instanceof Error ? err.message : String(err)
      );
      throw new Error(message);
    }
    throw err;
  }
}

function createRfcMessage({
  to,
  cc,
  subject,
  body,
  htmlBody,
  fromName,
  fromEmail,
  attachment,
  attachments,
  inReplyTo,
  references,
}: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  fromName?: string;
  fromEmail: string;
  attachment?: {
    filename: string;
    mimeType: string;
    contentBase64: string;
  };
  attachments?: Array<{
    filename: string;
    mimeType: string;
    contentBase64: string;
  }>;
  /** RFC Message-ID of the parent (angle brackets ok) */
  inReplyTo?: string;
  references?: string;
}) {
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  const altBoundary = `sr_alt_${Date.now()}`;
  const mixedBoundary = `sr_mix_${Date.now()}`;

  const html =
    htmlBody ||
    `<div style="font-family:sans-serif;white-space:pre-wrap">${body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</div>`;

  const alternative = [
    `--${altBoundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
    `--${altBoundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
    `--${altBoundary}--`,
  ].join("\r\n");

  const replyHeaders: string[] = [];
  if (inReplyTo) {
    const mid = inReplyTo.includes("<") ? inReplyTo : `<${inReplyTo}>`;
    replyHeaders.push(`In-Reply-To: ${mid}`);
    replyHeaders.push(`References: ${references || mid}`);
  }

  const headersBase = [
    `From: ${from}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    ...replyHeaders,
    "MIME-Version: 1.0",
  ].filter(Boolean);

  const files = [
    ...(attachments || []),
    ...(attachment?.contentBase64 ? [attachment] : []),
  ].filter((f) => f?.contentBase64);

  let raw: string;
  if (files.length) {
    const attachParts = files.map((file) => {
      const safeName = (file.filename || "attachment.bin").replace(/"/g, "");
      return [
        `--${mixedBoundary}`,
        `Content-Type: ${file.mimeType || "application/octet-stream"}; name="${safeName}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${safeName}"`,
        "",
        file.contentBase64.replace(/(.{76})/g, "$1\r\n"),
      ].join("\r\n");
    });

    raw = [
      ...headersBase,
      `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
      "",
      `--${mixedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      "",
      alternative,
      ...attachParts,
      `--${mixedBoundary}--`,
    ].join("\r\n");
  } else {
    raw = [
      ...headersBase,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      "",
      alternative,
    ].join("\r\n");
  }

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
    attachment?: {
      filename: string;
      mimeType: string;
      contentBase64: string;
    };
    attachments?: Array<{
      filename: string;
      mimeType: string;
      contentBase64: string;
    }>;
    /** Keep follow-up in the same Gmail conversation */
    threadId?: string;
    inReplyTo?: string;
    references?: string;
  }
) {
  const { client, user } = await ensureGmailAccessToken(userId);
  const gmail = google.gmail({ version: "v1", auth: client });
  const raw = createRfcMessage({
    ...opts,
    fromName: user.name || undefined,
    fromEmail: user.email,
    attachment: opts.attachment,
    attachments: opts.attachments,
    inReplyTo: opts.inReplyTo,
    references: opts.references,
  });

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        ...(opts.threadId ? { threadId: opts.threadId } : {}),
      },
    });
    return res.data;
  } catch (err) {
    if (isInvalidGrantError(err)) {
      const message = await markGmailNeedsReconnect(
        userId,
        err instanceof Error ? err.message : String(err)
      );
      throw new Error(message);
    }
    throw err;
  }
}

/** Resolve RFC Message-ID header from a Gmail API message id (for threading). */
export async function getGmailRfcMessageId(
  userId: string,
  gmailMessageId: string
): Promise<{ rfcMessageId: string | null; threadId: string | null }> {
  const { client } = await ensureGmailAccessToken(userId);
  const gmail = google.gmail({ version: "v1", auth: client });
  try {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id: gmailMessageId,
      format: "metadata",
      metadataHeaders: ["Message-ID", "Message-Id"],
    });
    const headers = msg.data.payload?.headers || [];
    const mid =
      headers.find((h) => (h.name || "").toLowerCase() === "message-id")
        ?.value || null;
    return {
      rfcMessageId: mid,
      threadId: msg.data.threadId || null,
    };
  } catch {
    return { rfcMessageId: null, threadId: null };
  }
}

export async function isUserGmailConnected(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return !!(
    user?.gmailConnected &&
    (user.googleAccessToken || user.googleRefreshToken)
  );
}
