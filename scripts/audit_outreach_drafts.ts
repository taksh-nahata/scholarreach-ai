/**
 * Quick audit of pending drafts for known email-quality failure modes.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "taksh.nahata37@gmail.com" },
  });
  if (!user) throw new Error("user not found");

  const drafts = await prisma.draft.findMany({
    where: {
      userId: user.id,
      status: { in: ["pending", "pending_review", "approved"] },
    },
    include: {
      professor: { select: { name: true, university: true, recentPaper: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  for (const d of drafts) {
    const flags = [
      /TechSteps[\s\S]{0,120}(AIEA|Cal Poly|VEX)/i.test(d.body)
        ? "TECHSTEPS_LEAD"
        : "",
      /A concrete takeaway/i.test(d.body) ? "ABSTRACT_DUMP" : "",
      /\bArchitected and launched\b/.test(d.body) ? "RESUME_SPEAK" : "",
      /cannot help with on-site/i.test(d.body) ? "remote_pivot" : "",
      /Physical AI Governance/i.test(d.body) &&
      /cannot help with on-site/i.test(d.body)
        ? "FALSE_PHYSICAL_PIVOT"
        : "",
    ].filter(Boolean);
    console.log(
      `${(d.professor?.name || "?").slice(0, 28).padEnd(28)} | ${flags.join(",") || "ok"} | ${(d.subject || "").slice(0, 70)}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
