/**
 * Verify Taksh Gmail OAuth is actually usable after reconnect.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  ensureGmailAccessToken,
  isUserGmailConnected,
} from "../src/services/gmail_oauth_service";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "taksh.nahata37@gmail.com" },
  });
  if (!user) throw new Error("user not found");

  const snapshot = {
    gmailConnected: user.gmailConnected,
    mailProvider: user.mailProvider,
    hasRefresh: !!user.googleRefreshToken,
    refreshLen: user.googleRefreshToken?.length || 0,
    hasAccess: !!user.googleAccessToken,
    tokenExpiry: user.googleTokenExpiry,
  };
  console.log("db", snapshot);

  const connected = await isUserGmailConnected(user.id);
  console.log("isUserGmailConnected", connected);

  let authOk = false;
  let authError: string | null = null;
  try {
    const { accessToken } = await ensureGmailAccessToken(user.id);
    authOk = !!accessToken && accessToken.length > 20;
    console.log("liveRefresh", {
      ok: authOk,
      accessTokenLen: accessToken?.length || 0,
    });
  } catch (err) {
    authError = err instanceof Error ? err.message : String(err);
    console.log("liveRefresh FAILED", authError);
  }

  const held = await prisma.scheduledEmail.count({
    where: {
      userId: user.id,
      status: "scheduled",
      OR: [
        { lastError: { contains: "invalid_grant" } },
        { lastError: { contains: "Gmail authorization expired" } },
        { lastError: { contains: "Reconnect Gmail" } },
      ],
    },
  });

  const queued = await prisma.scheduledEmail.groupBy({
    by: ["status", "kind"],
    where: { userId: user.id },
    _count: true,
  });

  const nextDue = await prisma.scheduledEmail.findMany({
    where: { userId: user.id, status: "scheduled" },
    orderBy: { scheduledIso: "asc" },
    take: 5,
    select: {
      kind: true,
      professorName: true,
      university: true,
      scheduledTime: true,
      scheduledIso: true,
      lastError: true,
    },
  });

  // Clear any leftover auth-hold errors now that refresh works
  if (authOk && held > 0) {
    const cleared = await prisma.scheduledEmail.updateMany({
      where: {
        userId: user.id,
        status: "scheduled",
        OR: [
          { lastError: { contains: "invalid_grant" } },
          { lastError: { contains: "Gmail authorization expired" } },
          { lastError: { contains: "Reconnect Gmail" } },
        ],
      },
      data: { lastError: null },
    });
    console.log("clearedAuthHolds", cleared.count);
  }

  console.log(
    JSON.stringify(
      {
        verdict: authOk
          ? "READY — Gmail token refreshes successfully"
          : "NOT READY — reconnect failed or token still dead",
        authOk,
        authError,
        heldAuthErrorsRemaining: held,
        queued,
        nextDue,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
  if (!authOk) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
