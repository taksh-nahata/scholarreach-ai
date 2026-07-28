import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TARGET = "taksh.nahata37@gmail.com";
const LEGACY = "takshnahata37@gmail.com";
const NAME = "Taksh Nahata";

async function main() {
  const legacy = await prisma.user.findUnique({ where: { email: LEGACY } });
  const existing = await prisma.user.findUnique({ where: { email: TARGET } });

  let user;

  if (legacy && !existing) {
    user = await prisma.user.update({
      where: { id: legacy.id },
      data: {
        email: TARGET,
        name: NAME,
      },
    });
    console.log(`[account] Renamed legacy user ${LEGACY} → ${TARGET}`);
  } else if (legacy && existing && legacy.id !== existing.id) {
    // Move all data from legacy → target, then delete legacy
    await prisma.$transaction([
      prisma.professor.updateMany({
        where: { userId: legacy.id },
        data: { userId: existing.id },
      }),
      prisma.draft.updateMany({
        where: { userId: legacy.id },
        data: { userId: existing.id },
      }),
      prisma.scheduledEmail.updateMany({
        where: { userId: legacy.id },
        data: { userId: existing.id },
      }),
      prisma.sentHistory.updateMany({
        where: { userId: legacy.id },
        data: { userId: existing.id },
      }),
      prisma.user.update({
        where: { id: existing.id },
        data: { name: NAME, email: TARGET },
      }),
      prisma.user.delete({ where: { id: legacy.id } }),
    ]);
    user = await prisma.user.findUnique({ where: { email: TARGET } });
    console.log(`[account] Merged legacy data into ${TARGET}`);
  } else {
    user = await prisma.user.upsert({
      where: { email: TARGET },
      update: { name: NAME },
      create: {
        email: TARGET,
        name: NAME,
        gmailConnected: false,
      },
    });
    console.log(`[account] Upserted ${TARGET}`);
  }

  const [profs, drafts, scheduled, sent] = await Promise.all([
    prisma.professor.count({ where: { userId: user!.id } }),
    prisma.draft.count({ where: { userId: user!.id } }),
    prisma.scheduledEmail.count({
      where: { userId: user!.id, status: "scheduled" },
    }),
    prisma.scheduledEmail.count({
      where: { userId: user!.id, status: "sent" },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        id: user!.id,
        email: user!.email,
        name: user!.name,
        professors: profs,
        drafts,
        scheduled,
        sent,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
