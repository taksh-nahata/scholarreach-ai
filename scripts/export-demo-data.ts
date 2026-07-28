/**
 * Export a lightweight demo snapshot for GitHub Pages.
 * NEVER run against a real private account without an explicit flag.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";

const OUT = path.join(__dirname, "../public/demo-data.json");

async function main() {
  if (process.env.ALLOW_PRIVATE_DEMO_EXPORT !== "1") {
    console.error(
      "[demo-export] Refused. This would overwrite public/demo-data.json with private DB rows.\n" +
        "Keep the committed commercial sample. Only set ALLOW_PRIVATE_DEMO_EXPORT=1 for local experiments."
    );
    process.exit(1);
  }

  // Late import so refusal is fast without Prisma when blocked
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  try {
    const email = process.env.DEMO_EXPORT_EMAIL;
    if (!email) {
      throw new Error("Set DEMO_EXPORT_EMAIL to a non-personal sample account");
    }
    if (/taksh|nahata/i.test(email)) {
      throw new Error("Refusing to export Taksh personal account to public demo");
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`User ${email} not found`);

    const [professors, drafts, scheduled] = await Promise.all([
      prisma.professor.findMany({
        where: { userId: user.id },
        take: 12,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          university: true,
          researchFocus: true,
          recentPaper: true,
          labName: true,
          tags: true,
          emailVerified: true,
        },
      }),
      prisma.draft.findMany({
        where: { userId: user.id, status: { in: ["pending", "pending_review"] } },
        take: 6,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          subject: true,
          body: true,
          status: true,
          recipientEmail: true,
        },
      }),
      prisma.scheduledEmail.findMany({
        where: { userId: user.id },
        take: 12,
        orderBy: { scheduledIso: "asc" },
        select: {
          id: true,
          professorName: true,
          university: true,
          toEmail: true,
          subject: true,
          scheduledIso: true,
          scheduledTime: true,
          status: true,
        },
      }),
    ]);

    // Redact real emails in any accidental export
    const redacted = {
      generatedAt: new Date().toISOString(),
      user: {
        email: "student@university.edu",
        name: "Student Researcher",
        gmailConnected: false,
      },
      metrics: {
        totalLeads: professors.length,
        pendingApprovals: drafts.length,
        scheduledSends: scheduled.filter((s) => s.status === "scheduled").length,
        emailsDelivered: scheduled.filter((s) => s.status === "sent").length,
      },
      professors: professors.map((p, i) => ({
        ...p,
        email: `demo.faculty${i + 1}@university.edu`,
      })),
      drafts: drafts.map((d) => ({
        ...d,
        recipientEmail: "demo.faculty@university.edu",
        body: d.body.slice(0, 280) + (d.body.length > 280 ? "…" : ""),
      })),
      queue: scheduled.map((s) => ({
        ...s,
        toEmail: "demo.faculty@university.edu",
        scheduledIso: s.scheduledIso?.toISOString?.() || s.scheduledIso,
      })),
    };

    fs.writeFileSync(OUT, JSON.stringify(redacted, null, 2));
    console.log(`Wrote redacted demo to ${OUT}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
