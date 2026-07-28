import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (session?.user?.email) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });
    if (user) return user;
  }

  // Dev fallback: default seeded account so UI works before OAuth is configured
  const email = process.env.DEFAULT_USER_EMAIL || "takshnahata37@gmail.com";
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: process.env.DEFAULT_USER_NAME || "Taksh Nahata",
    },
  });
}
