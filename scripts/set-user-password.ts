/**
 * Set or reset password for an existing user (local ops).
 * Usage: npx tsx scripts/set-user-password.ts email@x.com 'NewPassword123'
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const password = process.argv[3] || "";
  if (!email || !password || password.length < 8) {
    console.error("Usage: npx tsx scripts/set-user-password.ts <email> <password>");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash },
    create: { email, name: email.split("@")[0], passwordHash: hash },
  });
  console.log(JSON.stringify({ ok: true, email: user.email, id: user.id }));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
