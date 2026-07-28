import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Resolve the signed-in workspace user.
 * Production fails closed — never falls back to a default account.
 */
export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (session?.user?.email) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });
    if (user) return user;
  }

  // Local/dev only — never in production (protects private outreach data)
  const allowFallback =
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_DEFAULT_USER === "true";

  if (allowFallback) {
    const email =
      process.env.DEFAULT_USER_EMAIL || "dev@localhost.test";
    return prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: process.env.DEFAULT_USER_NAME || "Dev User",
      },
    });
  }

  throw new Error("Unauthorized");
}
