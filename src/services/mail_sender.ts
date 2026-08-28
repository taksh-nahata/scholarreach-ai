/**
 * Send from the student's real Gmail when OAuth is connected.
 */
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/mail-crypto";
import { sendGmailForUser } from "@/services/gmail_oauth_service";
import {
  isPlatformMailConfigured,
  sendViaResend,
} from "@/services/platform_mail";
import { resolveOutboundAttachments } from "@/services/profile_attachments";

export async function sendMailForUser(
  userId: string,
  opts: {
    to: string;
    cc?: string;
    subject: string;
    body: string;
    htmlBody?: string;
    skipCvAttachment?: boolean;
    professorFocus?: string | null;
    professorUniversity?: string | null;
    threadId?: string;
    inReplyTo?: string;
    references?: string;
  }
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const resolved =
    opts.skipCvAttachment === true
      ? { attachments: [] as Array<{ filename: string; mimeType: string; contentBase64: string }> }
      : await resolveOutboundAttachments(userId, {
          professorFocus: opts.professorFocus,
          professorUniversity: opts.professorUniversity,
          subject: opts.subject,
          body: opts.body,
        });

  const attachments = resolved.attachments.map((a) => ({
    filename: a.filename,
    mimeType: a.mimeType,
    contentBase64: a.contentBase64,
  }));

  // 1) Student's Gmail via OAuth
  if (user.gmailConnected && (user.googleRefreshToken || user.googleAccessToken)) {
    return sendGmailForUser(userId, {
      ...opts,
      attachments,
      threadId: opts.threadId,
      inReplyTo: opts.inReplyTo,
      references: opts.references,
    });
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
          attachments: attachments.length
            ? attachments.map((a) => ({
                "@odata.type": "#microsoft.graph.fileAttachment",
                name: a.filename,
                contentType: a.mimeType,
                contentBytes: a.contentBase64,
              }))
            : undefined,
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
      attachments: attachments.length
        ? attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.contentBase64, "base64"),
            contentType: a.mimeType,
          }))
        : undefined,
    });
    return { id: info.messageId };
  }

  // 4) Optional platform mail
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
    "Gmail not connected. Open Connect Inbox → Request Gmail access."
  );
}
