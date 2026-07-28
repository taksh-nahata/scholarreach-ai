import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const email = "takshnahata37@gmail.com";
  const u = await p.user.findUnique({ where: { email } });
  if (!u) {
    console.log("DB user missing");
    await p.$disconnect();
    return;
  }
  const [profs, drafts, sched, sent] = await Promise.all([
    p.professor.count({ where: { userId: u.id } }),
    p.draft.count({ where: { userId: u.id } }),
    p.scheduledEmail.count({ where: { userId: u.id, status: "scheduled" } }),
    p.scheduledEmail.count({ where: { userId: u.id, status: "sent" } }),
  ]);
  console.log("LOCAL SQLITE (saas_platform)");
  console.log("  user", u.email);
  console.log("  professors", profs);
  console.log("  drafts", drafts);
  console.log("  scheduled", sched);
  console.log("  sent", sent);
  await p.$disconnect();
}

main();
