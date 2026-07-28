/**
 * Export a lightweight demo snapshot for GitHub Pages static hosting.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const OUT = path.join(__dirname, "../public/demo-data.json");

async function main() {
  const email = process.env.DEFAULT_USER_EMAIL || "takshnahata37@gmail.com";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`User ${email} not found — run npm run db:seed first`);

  const [professors, drafts, scheduled, metrics] = await Promise.all([
    prisma.professor.findMany({
      where: { userId: user.id },
      take: 40,
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
      where: {
        userId: user.id,
        status: { in: ["pending", "pending_review"] },
      },
      take: 12,
      orderBy: { updatedAt: "desc" },
      include: {
        professor: {
          select: {
            name: true,
            university: true,
            researchFocus: true,
            recentPaper: true,
            email: true,
            specialInstructions: true,
          },
        },
      },
    }),
    prisma.scheduledEmail.findMany({
      where: { userId: user.id },
      take: 30,
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
        lastError: true,
      },
    }),
    Promise.all([
      prisma.professor.count({ where: { userId: user.id } }),
      prisma.draft.count({
        where: {
          userId: user.id,
          status: { in: ["pending", "pending_review"] },
        },
      }),
      prisma.scheduledEmail.count({ where: { userId: user.id, status: "scheduled" } }),
      prisma.scheduledEmail.count({ where: { userId: user.id, status: "sent" } }),
    ]),
  ]);

  const bundle = {
    generatedAt: new Date().toISOString(),
    user: {
      email: user.email,
      name: user.name,
      gmailConnected: user.gmailConnected,
    },
    metrics: {
      totalLeads: metrics[0],
      pendingApprovals: metrics[1],
      scheduledSends: metrics[2],
      emailsDelivered: metrics[3],
    },
    professors,
    drafts,
    queue: scheduled.map((s) => ({
      ...s,
      scheduledIso: s.scheduledIso.toISOString(),
    })),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(bundle, null, 2));
  console.log(`[demo] Wrote ${OUT}`);
  console.log(
    `[demo] professors=${professors.length} drafts=${drafts.length} queue=${scheduled.length}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
