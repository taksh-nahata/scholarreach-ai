/**
 * Reparse Taksh's stored CV into structured profile fields.
 * Usage: npx tsx scripts/reparse_taksh_cv.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { reparseStoredCv } from "../src/services/cv_ingest";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "taksh.nahata37@gmail.com" },
  });
  if (!user) throw new Error("user not found");

  // Prefer formal availability while we're here
  await prisma.studentProfile.update({
    where: { userId: user.id },
    data: {
      availabilityNotes:
        "I am available for about 15 hours per week this fall on a volunteer basis, and I can increase that commitment if the project requires it",
      location: "Folsom, CA",
    },
  });

  const result = await reparseStoredCv(user.id);
  const e = result.extracted as {
    skills: { languages: string[]; frameworks: string[]; expertise: string[] };
    projects: Array<{ name: string; role?: string }>;
    achievements: Array<{ title: string }>;
  };
  console.log({
    parseScore: result.parseScore,
    skills: e.skills,
    projectCount: e.projects.length,
    projects: e.projects.map((p) => `${p.role} @ ${p.name}`),
    achievementCount: e.achievements.length,
    achievements: e.achievements.map((a) => a.title),
  });
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
