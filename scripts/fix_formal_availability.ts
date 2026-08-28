/**
 * Clean informal availability notes + redraft pending/scheduled outreach.
 * Usage: npx tsx scripts/fix_formal_availability.ts
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

  await prisma.studentProfile.update({
    where: { userId: user.id },
    data: {
      availabilityNotes:
        "I am available for about 15 hours per week this fall on a volunteer basis, and I can increase that commitment if the project requires it",
      location: "Folsom, CA",
    },
  });
  console.log("Updated availability notes + location");

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
    select: { id: true, professorId: true },
  });

  const professorIds = Array.from(
    new Set(
      [...pending, ...scheduled]
        .map((r) => r.professorId)
        .filter((id): id is string => !!id)
    )
  );

  console.log({
    pendingDrafts: pending.length,
    scheduledOutreach: scheduled.length,
    uniqueProfessors: professorIds.length,
  });

  if (pending.length) {
    await prisma.draft.updateMany({
      where: { id: { in: pending.map((d) => d.id) } },
      data: {
        status: "rejected",
        reviewStatus: "rejected",
        reviewNotes: "superseded: formal availability / no location-rule leak",
      },
    });
  }

  let ok = 0;
  let fail = 0;
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
        data: {
          subject: draft.subject,
          body: prepared.body,
        },
      });
      ok += 1;
      const leaked =
        /location-based|If distance is unknown|Just let me know about your preferences/i.test(
          draft.body
        );
      if (ok === 1 || leaked) {
        const avail = draft.body.match(
          /I am available[\s\S]*?(?=\n\nMy goal|\n\nWould you|\n\nIf you have)/
        );
        console.log(
          `SAMPLE/LEAK ok=${ok} leaked=${leaked}\n`,
          avail?.[0] || draft.body.slice(0, 400)
        );
      } else {
        console.log(
          `OK ${ok}/${professorIds.length} · score=${result.formatScore}`
        );
      }
    } catch (err) {
      fail += 1;
      console.warn(
        `FAIL ${professorId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log({ rewritten: ok, failed: fail });
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
