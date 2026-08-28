/**
 * Quick redraft after CV reparse.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { generatePersonalizedDraft } from "../src/services/email_personalizer";
import { prepareEmailBodies } from "../src/services/email_format";
import { PENDING_APPROVAL_STATUSES } from "../src/lib/draft_status";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "taksh.nahata37@gmail.com" },
  });
  if (!user) throw new Error("user not found");

  const pending = await prisma.draft.findMany({
    where: {
      userId: user.id,
      status: { in: [...PENDING_APPROVAL_STATUSES, "pending", "approved"] },
    },
    select: { id: true, professorId: true },
  });
  const scheduled = await prisma.scheduledEmail.findMany({
    where: {
      userId: user.id,
      status: "scheduled",
      NOT: { kind: "follow_up" },
    },
    select: { professorId: true },
  });
  const professorIds = Array.from(
    new Set(
      [...pending, ...scheduled]
        .map((r) => r.professorId)
        .filter((id): id is string => !!id)
    )
  );

  if (pending.length) {
    await prisma.draft.updateMany({
      where: { id: { in: pending.map((d) => d.id) } },
      data: {
        status: "rejected",
        reviewStatus: "rejected",
        reviewNotes: "superseded: short letter rewrite (technical hook + remote honesty)",
      },
    });
  }

  let ok = 0;
  for (const professorId of professorIds) {
    try {
      const result = await generatePersonalizedDraft({
        userId: user.id,
        professorId,
      });
      const draft = result.draft;
      const prepared = prepareEmailBodies(draft.body, {
        willAttach: true,
        docType: "cv",
      });
      await prisma.scheduledEmail.updateMany({
        where: {
          userId: user.id,
          professorId,
          status: "scheduled",
          NOT: { kind: "follow_up" },
        },
        data: { subject: draft.subject, body: prepared.body },
      });
      ok += 1;
      if (ok === 1 || /kroemer/i.test(draft.body) || /Unweaving Multiple Cables/i.test(draft.body)) {
        console.log(`\n--- sample (${draft.subject}) ---\n`);
        console.log(draft.body.slice(0, 1400));
        console.log("\n--- end sample ---\n");
      }
      console.log(`OK ${ok}/${professorIds.length} score=${result.formatScore}`);
    } catch (err) {
      console.warn(err instanceof Error ? err.message : err);
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
