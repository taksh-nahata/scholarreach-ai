/**
 * Encrypt/decrypt SMTP secrets at rest using NEXTAUTH_SECRET.
 */
import crypto from "crypto";

function key() {
  const secret = process.env.NEXTAUTH_SECRET || "dev-only-insecure";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export const MAIL_PRESETS = {
  gmail_smtp: {
    label: "Gmail (App Password)",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    help: "Family Link / supervised accounts: create an App Password at myaccount.google.com/apppasswords (parent may need to allow it), or use Sign in with Google + Connect Gmail.",
  },
  outlook_smtp: {
    label: "Outlook / Hotmail / Live",
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    help: "Use your Microsoft account email + an app password if 2FA is on.",
  },
  yahoo_smtp: {
    label: "Yahoo Mail",
    host: "smtp.mail.yahoo.com",
    port: 465,
    secure: true,
    help: "Generate an app password in Yahoo Account Security.",
  },
  custom_smtp: {
    label: "Custom SMTP (school / other)",
    host: "",
    port: 587,
    secure: false,
    help: "Ask your school IT for SMTP host, port, and credentials.",
  },
} as const;

export type MailPresetId = keyof typeof MAIL_PRESETS;
