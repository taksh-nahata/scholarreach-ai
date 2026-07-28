import { NextRequest, NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  encryptSecret,
  MAIL_PRESETS,
  type MailPresetId,
} from "@/lib/mail-crypto";
import nodemailer from "nodemailer";

export async function GET() {
  return withAuthUser(async (user) => {
    return NextResponse.json({
      mailProvider: user.mailProvider,
      mailConnected: user.mailConnected || user.gmailConnected,
      gmailConnected: user.gmailConnected,
      smtpHost: user.smtpHost,
      smtpUser: user.smtpUser,
      presets: MAIL_PRESETS,
    });
  });
}

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json();
    const preset = (body.preset || "custom_smtp") as MailPresetId;
    const presetCfg = MAIL_PRESETS[preset] || MAIL_PRESETS.custom_smtp;

    const host = String(body.host || presetCfg.host || "").trim();
    const port = Number(body.port || presetCfg.port || 587);
    const smtpUser = String(body.username || body.email || user.email).trim();
    const password = String(body.password || "").trim();

    if (!host || !smtpUser || !password) {
      return NextResponse.json(
        { error: "Host, username/email, and password (or app password) are required." },
        { status: 400 }
      );
    }

    // Verify SMTP before saving
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465 || !!presetCfg.secure,
      auth: { user: smtpUser, pass: password },
    });

    try {
      await transporter.verify();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "SMTP verification failed. Check host/port/app password.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const provider =
      preset === "gmail_smtp"
        ? "gmail"
        : preset === "outlook_smtp"
          ? "outlook"
          : preset === "yahoo_smtp"
            ? "yahoo"
            : "smtp";

    await prisma.user.update({
      where: { id: user.id },
      data: {
        mailProvider: provider,
        mailConnected: true,
        gmailConnected: provider === "gmail",
        smtpHost: host,
        smtpPort: port,
        smtpUser,
        smtpPassEnc: encryptSecret(password),
      },
    });

    return NextResponse.json({ ok: true, mailProvider: provider });
  });
}

export async function DELETE() {
  return withAuthUser(async (user) => {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        mailConnected: false,
        gmailConnected: false,
        mailProvider: null,
        smtpHost: null,
        smtpPort: null,
        smtpUser: null,
        smtpPassEnc: null,
        googleAccessToken: null,
        googleRefreshToken: null,
        microsoftAccessToken: null,
        microsoftRefreshToken: null,
      },
    });
    return NextResponse.json({ ok: true });
  });
}
