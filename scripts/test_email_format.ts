/**
 * Test acceptance email format against tip checklist.
 * Usage: npx tsx scripts/test_email_format.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { scoreAcceptanceFormat } from "../src/services/email_acceptance_format";
import { generatePersonalizedDraft } from "../src/services/email_personalizer";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "taksh.nahata37@gmail.com" },
  });
  if (!user) throw new Error("user not found");

  // Ensure availability notes exist for intensity tip
  await prisma.studentProfile.updateMany({
    where: { userId: user.id, OR: [{ availabilityNotes: null }, { availabilityNotes: "" }] },
    data: {
      availabilityNotes:
        "About 8-12 hours per week during the school year; open to a fuller summer stretch if the project needs it",
    },
  });

  const professor = await prisma.professor.findFirst({
    where: {
      userId: user.id,
      emailVerified: true,
      email: { not: null },
      recentPaper: { not: null },
    },
    orderBy: { matchScore: "desc" },
  });
  if (!professor) {
    // fall back to any verified
    const any = await prisma.professor.findFirst({
      where: { userId: user.id, emailVerified: true, email: { not: null } },
      orderBy: { matchScore: "desc" },
    });
    if (!any) throw new Error("No verified professor to draft against");
    Object.assign(professor || {}, any);
  }
  const prof =
    professor ||
    (await prisma.professor.findFirst({
      where: { userId: user.id, emailVerified: true },
    }));
  if (!prof) throw new Error("no professor");

  // Clear an existing pending draft for this prof so we can regenerate
  await prisma.draft.updateMany({
    where: {
      userId: user.id,
      professorId: prof.id,
      status: { in: ["pending", "pending_review"] },
    },
    data: { status: "rejected", reviewNotes: "Superseded by format test" },
  });

  console.log(`\n=== Drafting for ${prof.name} @ ${prof.university} ===\n`);
  console.log(`Paper: ${prof.recentPaper || prof.researchFocus || "(none)"}\n`);

  const result = await generatePersonalizedDraft({
    userId: user.id,
    professorId: prof.id,
  });

  const subject = result.draft.subject;
  const body = result.draft.body;
  const score = scoreAcceptanceFormat({
    subject,
    body,
    willAttach: !!(result.hasCv && body.match(/attach/i)),
    requireDualEnrollment: true,
  });

  console.log("SUBJECT:", subject);
  console.log("\n----- BODY -----\n");
  console.log(body);
  console.log("\n----- SCORECARD -----");
  console.log({
    formatScore: score.score,
    provider: result.draft.providerUsed,
    isFallback: result.draft.isFallback,
    checklist: {
      clearSubject: score.clearSubject,
      whyThisPerson: score.whyThisPerson,
      specificPaperOrWork: score.specificPaperOrWork,
      studentIdentityClear: score.studentIdentityClear,
      whatYouOffer: score.whatYouOffer,
      specialSkillsOrFocus: score.specialSkillsOrFocus,
      timeIntensity: score.timeIntensity,
      goals: score.goals,
      localOrWorkMode: score.localOrWorkMode,
      softAsk: score.softAsk,
      attachmentOk: score.attachmentOk,
      simpleReadable: score.simpleReadable,
    },
    missing: score.missing,
  });

  if (score.score < 85) {
    console.error(`\nFAIL: score ${score.score} < 85`);
    process.exitCode = 1;
  } else {
    console.log(`\nPASS: score ${score.score}/100`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
