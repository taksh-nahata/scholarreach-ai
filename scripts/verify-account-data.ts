import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

async function main() {
  const p = new PrismaClient();
  const email = "taksh.nahata37@gmail.com";
  const u = await p.user.findUnique({ where: { email } });
  const users = await p.user.findMany({
    select: { email: true, id: true, name: true },
  });
  console.log("users", users);

  if (!u) {
    console.log("MISSING canonical user");
    await p.$disconnect();
    return;
  }

  const [profs, drafts, sched, sent, hist, byStatus] = await Promise.all([
    p.professor.count({ where: { userId: u.id } }),
    p.draft.count({ where: { userId: u.id } }),
    p.scheduledEmail.count({ where: { userId: u.id, status: "scheduled" } }),
    p.scheduledEmail.count({ where: { userId: u.id, status: "sent" } }),
    p.sentHistory.count({ where: { userId: u.id } }),
    p.scheduledEmail.groupBy({
      by: ["status"],
      where: { userId: u.id },
      _count: true,
    }),
  ]);

  const dataDir = path.join(__dirname, "..", "..", "data");
  const outreach = JSON.parse(
    fs.readFileSync(path.join(dataDir, "outreach_data.json"), "utf8")
  );
  const contacted = JSON.parse(
    fs.readFileSync(path.join(dataDir, "contacted_emails.json"), "utf8")
  );
  const directory = JSON.parse(
    fs.readFileSync(path.join(dataDir, "professors_directory.json"), "utf8")
  );

  const source = {
    drafts: (outreach.drafts || []).length,
    scheduled: (outreach.scheduledEmails || []).filter(
      (s: { status?: string }) => s.status === "scheduled"
    ).length,
    sentInScheduled: (outreach.scheduledEmails || []).filter(
      (s: { status?: string }) => s.status === "sent"
    ).length,
    allScheduledRows: (outreach.scheduledEmails || []).length,
    contacted: Array.isArray(contacted) ? contacted.length : Object.keys(contacted || {}).length,
    directory: Array.isArray(directory)
      ? directory.length
      : (directory.professors || []).length,
  };

  console.log(
    JSON.stringify(
      {
        neon: {
          email: u.email,
          name: u.name,
          professors: profs,
          drafts,
          scheduled: sched,
          sent,
          sentHistory: hist,
          byStatus,
        },
        sourceFiles: source,
      },
      null,
      2
    )
  );
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
