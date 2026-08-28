/**
 * Cancel follow-ups to people the platform never emailed
 * (Gmail/import "legacy contacted" rows, personal addresses, junk To:).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  isFollowUpEligibleAddress,
  isLegacyContactedSubject,
} from "../src/services/follow_up_guards";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "taksh.nahata37@gmail.com" },
  });
  if (!user) throw new Error("user not found");

  const platformSent = await prisma.scheduledEmail.findMany({
    where: { userId: user.id, status: "sent", kind: "outreach" },
    select: { toEmail: true },
  });
  const platformEmails = new Set(
    platformSent.map((r) => r.toEmail.toLowerCase())
  );
  console.log("platform-sent outreach addresses:", platformEmails.size);

  const sending = await prisma.scheduledEmail.findMany({
    where: {
      userId: user.id,
      kind: "follow_up",
      status: { in: ["sending", "scheduled"] },
    },
  });
  const sendingCancel = sending.filter((item) => {
    const to = item.toEmail.toLowerCase();
    if (!isFollowUpEligibleAddress(to)) return true;
    if (isLegacyContactedSubject(item.subject)) return true;
    if (!item.professorId) return true;
    if (!platformEmails.has(to)) return true;
    return false;
  });
  if (sendingCancel.length) {
    const result = await prisma.scheduledEmail.updateMany({
      where: { id: { in: sendingCancel.map((i) => i.id) } },
      data: {
        status: "cancelled",
        lastError:
          "Cancelled — follow-up only allowed for professors this platform actually emailed",
      },
    });
    console.log("cancelled sending/scheduled follow-ups:", result.count);
  }

  const legacyHist = await prisma.sentHistory.updateMany({
    where: {
      userId: user.id,
      subject: { contains: "legacy contacted", mode: "insensitive" },
    },
    data: { kind: "legacy" },
  });
  console.log("relabeled sentHistory as kind=legacy:", legacyHist.count);

  const remaining = await prisma.scheduledEmail.findMany({
    where: { userId: user.id, status: "scheduled", kind: "follow_up" },
    select: {
      toEmail: true,
      professorName: true,
      subject: true,
      scheduledTime: true,
    },
    orderBy: { scheduledIso: "asc" },
  });
  console.log("remaining follow-ups:");
  for (const r of remaining) {
    console.log(
      `  KEEP ${r.professorName || "?"} <${r.toEmail}> ${r.scheduledTime} | ${r.subject}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
