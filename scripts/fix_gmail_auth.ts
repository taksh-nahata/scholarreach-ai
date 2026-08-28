/**
 * Mark Taksh Gmail as needing reconnect; unstick sending rows; hold invalid_grant queue.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { markGmailNeedsReconnect } from "../src/services/gmail_oauth_service";
import { dripDispatcher } from "../src/services/drip_dispatcher";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "taksh.nahata37@gmail.com" },
  });
  if (!user) throw new Error("user not found");

  // Unstick anything left mid-send
  const unstuck = await prisma.scheduledEmail.updateMany({
    where: { userId: user.id, status: "sending" },
    data: {
      status: "scheduled",
      lastError:
        "Gmail authorization expired — reconnect in Connect Inbox, then these will send in the next window",
    },
  });

  const msg = await markGmailNeedsReconnect(user.id, "invalid_grant from drip");

  // Normalize cryptic invalid_grant errors to the clear reconnect message
  const clarified = await prisma.scheduledEmail.updateMany({
    where: {
      userId: user.id,
      status: "scheduled",
      OR: [
        { lastError: "invalid_grant" },
        { lastError: { contains: "invalid_grant" } },
      ],
    },
    data: { lastError: msg },
  });

  // Items already rolled to next week stay there — after reconnect they'll send
  const nextPacific = dripDispatcher.formatSlot(
    dripDispatcher.getNextAcademicWindowSlot(new Date(), "Stanford University"),
    "Stanford University"
  );
  const nextEast = dripDispatcher.formatSlot(
    dripDispatcher.getNextAcademicWindowSlot(new Date(), "MIT"),
    "MIT"
  );

  console.log({
    unstuck: unstuck.count,
    clarified: clarified.count,
    gmailMessage: msg,
    nextPacific,
    nextEast,
    note: "User must reconnect Gmail at /connect-inbox before anything sends",
  });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
