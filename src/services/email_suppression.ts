/**
 * Per-user email suppression (bounces, unsubscribe, "please remove").
 */
import { prisma } from "@/lib/prisma";

export async function isEmailSuppressed(
  userId: string,
  email: string
): Promise<boolean> {
  const row = await prisma.emailSuppression.findUnique({
    where: {
      userId_email: {
        userId,
        email: email.toLowerCase().trim(),
      },
    },
  });
  return !!row;
}

export async function suppressEmail(opts: {
  userId: string;
  email: string;
  reason?: string;
  source?: string;
}) {
  const email = opts.email.toLowerCase().trim();
  if (!email.includes("@")) return null;
  return prisma.emailSuppression.upsert({
    where: { userId_email: { userId: opts.userId, email } },
    create: {
      userId: opts.userId,
      email,
      reason: opts.reason || null,
      source: opts.source || null,
    },
    update: {
      reason: opts.reason || undefined,
      source: opts.source || undefined,
    },
  });
}

const UNSUBSCRIBE_RE =
  /\b(unsubscribe|remove me|stop emailing|do not contact|opt[- ]?out|please delete)\b/i;

export function looksLikeUnsubscribe(text: string): boolean {
  return UNSUBSCRIBE_RE.test(text || "");
}
