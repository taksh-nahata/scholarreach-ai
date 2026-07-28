/**
 * Send from the student's real Gmail when OAuth is connected (Apps Script–style
 * permission, without Apps Script). Other providers are fallbacks only.
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

  // 1) Student's Gmail via OAuth (personal From: address)
  if (user.gmailConnected && (user.googleRefreshToken || user.googleAccessToken)) {
    return sendGmailForUser(userId, opts);
  }

  // 2) Outlook Graph
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

  // 3) Non-Gmail SMTP
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
      replyTo: user.email,
    });
    return { id: info.messageId };
  }

  // 4) Optional platform mail (only if user explicitly enabled it)
  if (
    user.mailProvider === "platform" &&
    user.mailConnected &&
    isPlatformMailConfigured()
  ) {
    return sendViaResend({
      ...opts,
      replyTo: user.email,
      fromName: user.name || undefined,
    });
  }

  throw new Error(
    "Gmail not connected. Open Connect Inbox → Request Gmail access (parent may need to approve)."
  );
}
