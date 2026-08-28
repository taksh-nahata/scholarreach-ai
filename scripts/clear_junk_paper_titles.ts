import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { isUsablePaperTitle } from "../src/services/email_acceptance_format";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "taksh.nahata37@gmail.com" },
  });
  if (!user) throw new Error("no user");

  const rows = await prisma.professor.findMany({
    where: { userId: user.id, recentPaper: { not: null } },
    select: { id: true, name: true, recentPaper: true },
  });

  let cleared = 0;
  for (const r of rows) {
    if (!isUsablePaperTitle(r.recentPaper)) {
      await prisma.professor.update({
        where: { id: r.id },
        data: { recentPaper: null },
      });
      cleared++;
      console.log("cleared", r.name, "→", r.recentPaper);
    }
  }
  console.log({ total: rows.length, cleared });
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
