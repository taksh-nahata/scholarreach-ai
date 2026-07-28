/**
 * Send mail via connected provider.
 * Preferred scalable path: platform Resend (no Gmail SMTP / Apps Script caps).
 */
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/mail-crypto";
import { sendGmailForUser } from "@/services/gmail_oauth_service";
import {
  isPlatformMailConfigured,
  sendViaResend,
} from "@/services/platform_mail";

export async function sendMailForUser(
  userId: string,
  opts: {
    to: string;
    cc?: string;
    subject: string;
    body: string;
    htmlBody?: string;
  }
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const replyTo = user.email;
  const fromName = user.name || undefined;

  // Platform transactional mail (scalable) — default when user opted in
  if (
    user.mailProvider === "platform" &&
    user.mailConnected &&
    isPlatformMailConfigured()
  ) {
    return sendViaResend({
      ...opts,
      replyTo,
      fromName,
    });
  }

  // Gmail API OAuth (personal Gmail daily caps still apply)
  if (user.gmailConnected && (user.googleRefreshToken || user.googleAccessToken)) {
    return sendGmailForUser(userId, opts);
  }

  // Microsoft Graph
  if (user.mailProvider === "outlook" && user.microsoftAccessToken) {
    const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${user.microsoftAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: opts.subject,
          body: {
            contentType: opts.htmlBody ? "HTML" : "Text",
            content: opts.htmlBody || opts.body,
          },
          toRecipients: [{ emailAddress: { address: opts.to } }],
          ccRecipients: opts.cc
            ? opts.cc.split(",").map((a) => ({
                emailAddress: { address: a.trim() },
              }))
            : [],
        },
        saveToSentItems: true,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Outlook send failed: ${text.slice(0, 200)}`);
    }
    return { id: `outlook-${Date.now()}` };
  }

  // SMTP for Outlook/Yahoo/school (not recommended for Gmail)
  if (user.smtpHost && user.smtpUser && user.smtpPassEnc) {
    const pass = decryptSecret(user.smtpPassEnc);
    const port = user.smtpPort || 587;
    const transporter = nodemailer.createTransport({
      host: user.smtpHost,
      port,
      secure: port === 465,
      auth: { user: user.smtpUser, pass },
    });
    const info = await transporter.sendMail({
      from: user.smtpUser,
      to: opts.to,
      cc: opts.cc || undefined,
      subject: opts.subject,
      text: opts.body,
      html: opts.htmlBody || undefined,
      replyTo,
    });
    return { id: info.messageId };
  }

  // Fallback: if platform is configured and user somehow has mailConnected
  if (user.mailConnected && isPlatformMailConfigured()) {
    return sendViaResend({ ...opts, replyTo, fromName });
  }

  throw new Error(
    "No send path connected. Open Connect Inbox → enable Platform sending (Resend)."
  );
}
