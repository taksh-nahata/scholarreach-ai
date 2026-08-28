/**
 * Smoke-test paper context + why-them narrative for one professor.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { fetchPaperContext } from "../src/services/paper_context";
import { buildWhyThemStory } from "../src/services/why_them_narrative";
import { generatePersonalizedDraft } from "../src/services/email_personalizer";
import { PENDING_APPROVAL_STATUSES } from "../src/lib/draft_status";
import { prepareEmailBodies } from "../src/services/email_format";

const prisma = new PrismaClient();

async function main() {
  const title =
    "Growing Adaptability Among Undocumented Communities During Climate-Induced Disasters: An Analysis of the Role of Migrant-Serving Organizations";
  const ctx = await fetchPaperContext(title);
  console.log({
    source: ctx?.source,
    abstractLen: ctx?.abstract?.length || 0,
    insight: ctx?.insight?.slice(0, 280),
    themes: ctx?.themes?.slice(0, 4),
  });

  const user = await prisma.user.findFirst({
    where: { email: "taksh.nahata37@gmail.com" },
  });
  if (!user) throw new Error("user not found");
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: user.id },
  });

  const why = buildWhyThemStory({
    university: "Georgia Tech",
    paperTitle: title,
    researchFocus: "climate adaptation / migrant-serving organizations",
    paper: ctx,
    projectsJson: profile?.projectsJson,
    brief: profile?.profileBrief,
  });
  console.log("\n--- WHY THEM ---\n", why);

  // Redraft all pending/scheduled
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
        reviewNotes: "superseded: paper-insight narrative",
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
      if (ok <= 2) {
        const para = draft.body.split("\n\n")[1] || "";
        const whyPara = draft.body.split("\n\n")[2] || "";
        console.log(`\n=== SAMPLE ${ok} (${draft.providerUsed}) score=${result.formatScore} ===`);
        console.log(whyPara.slice(0, 900));
        console.log("generic?", /\bI spent time with that work\b/i.test(draft.body));
      } else {
        console.log(`OK ${ok}/${professorIds.length} score=${result.formatScore}`);
      }
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
