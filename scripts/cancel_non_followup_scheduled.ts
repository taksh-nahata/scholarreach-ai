import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "taksh.nahata37@gmail.com" },
  });
  if (!user) throw new Error("user not found");

  const before = await prisma.scheduledEmail.groupBy({
    by: ["kind", "status"],
    where: { userId: user.id },
    _count: true,
  });
  console.log("before", before);

  const result = await prisma.scheduledEmail.updateMany({
    where: {
      userId: user.id,
      status: "scheduled",
      NOT: { kind: "follow_up" },
    },
    data: {
      status: "cancelled",
      lastError: "cancelled_bad_draft_format_2026-08-03",
    },
  });
  console.log("cancelled non-followup scheduled:", result.count);

  const after = await prisma.scheduledEmail.groupBy({
    by: ["kind", "status"],
    where: { userId: user.id },
    _count: true,
  });
  console.log("after", after);

  // Also wipe pending drafts that used DOI junk so they aren't re-approved
  const drafts = await prisma.draft.updateMany({
    where: {
      userId: user.id,
      status: { in: ["pending", "pending_review", "approved"] },
    },
    data: {
      status: "rejected",
      reviewStatus: "rejected",
      reviewNotes: "superseded: restore formal template + real paper titles",
    },
  });
  console.log("rejected pending/approved drafts:", drafts.count);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
