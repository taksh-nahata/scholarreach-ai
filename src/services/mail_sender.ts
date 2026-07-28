/**
 * Send mail via connected provider: Gmail OAuth, Microsoft Graph, or SMTP.
 */
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/mail-crypto";
import { sendGmailForUser } from "@/services/gmail_oauth_service";

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

  // Prefer Gmail OAuth when connected
  if (user.gmailConnected && (user.googleRefreshToken || user.googleAccessToken)) {
    return sendGmailForUser(userId, opts);
  }

  // Microsoft Graph send
  if (
    user.mailProvider === "outlook" &&
    user.microsoftAccessToken
  ) {
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

  // SMTP (Gmail app password / Yahoo / Outlook SMTP / custom)
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
    });
    return { id: info.messageId };
  }

  throw new Error(
    "No inbox connected. Open Connect Inbox to link Gmail, Outlook, Yahoo, or SMTP."
  );
}
