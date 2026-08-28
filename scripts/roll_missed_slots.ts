/**
 * Roll overdue / missed-window scheduled emails onto the next professor-local slot.
 * Usage: npx tsx scripts/roll_missed_slots.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { dripDispatcher } from "../src/services/drip_dispatcher";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const overdue = await prisma.scheduledEmail.findMany({
    where: {
      status: "scheduled",
      OR: [
        { scheduledIso: { lte: now } },
        { lastError: { contains: "Missed" } },
      ],
    },
    include: { professor: true },
    orderBy: { scheduledIso: "asc" },
  });

  console.log(`Found ${overdue.length} overdue/missed items`);
  let rolled = 0;
  for (const item of overdue) {
    const university = item.university || item.professor?.university || null;
    // If already scheduled in the future and not overdue, skip
    if (item.scheduledIso.getTime() > now.getTime() + 60_000) {
      // Still has Missed error but future slot — clear stale error only
      if (item.lastError?.includes("Missed")) {
        await prisma.scheduledEmail.update({
          where: { id: item.id },
          data: { lastError: null },
        });
      }
      continue;
    }

    const nextSlot = dripDispatcher.getNextAcademicWindowSlot(now, university);
    await prisma.scheduledEmail.update({
      where: { id: item.id },
      data: {
        scheduledIso: nextSlot,
        scheduledTime: dripDispatcher.formatSlot(nextSlot, university),
        lastError: `Rescheduled after missed window → ${dripDispatcher.formatSlot(nextSlot, university)}`,
      },
    });
    rolled += 1;
    console.log(
      `rolled ${item.kind} ${item.professorName || item.toEmail} → ${dripDispatcher.formatSlot(nextSlot, university)}`
    );
  }

  console.log({ rolled, skippedFuture: overdue.length - rolled });
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
