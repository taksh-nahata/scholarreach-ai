import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const r = await p.draft.groupBy({ by: ["status"], _count: true });
  console.log(r);
  const sample = await p.draft.findMany({
    take: 5,
    select: { status: true, subject: true },
  });
  console.log(sample);
  // Reset 15 drafts to pending for demo approvals UI
  const ids = await p.draft.findMany({
    where: { status: { not: "pending" } },
    take: 15,
    select: { id: true },
  });
  if (ids.length) {
    await p.draft.updateMany({
      where: { id: { in: ids.map((d) => d.id) } },
      data: { status: "pending" },
    });
    console.log("Reset", ids.length, "drafts to pending");
  }
  await p.$disconnect();
}

main();
