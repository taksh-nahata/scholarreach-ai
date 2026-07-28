import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const email = process.env.DEFAULT_USER_EMAIL || "taksh.nahata37@gmail.com";
  const u = await p.user.findUnique({ where: { email } });
  if (!u) {
    console.log("DB user missing:", email);
    await p.$disconnect();
    return;
  }
  const [profs, drafts, sched, sent, hist] = await Promise.all([
    p.professor.count({ where: { userId: u.id } }),
    p.draft.count({ where: { userId: u.id } }),
    p.scheduledEmail.count({ where: { userId: u.id, status: "scheduled" } }),
    p.scheduledEmail.count({ where: { userId: u.id, status: "sent" } }),
    p.sentHistory.count({ where: { userId: u.id } }),
  ]);
  console.log({
    email: u.email,
    professors: profs,
    drafts,
    scheduled: sched,
    sent,
    sentHistory: hist,
  });
  await p.$disconnect();
}

main();
