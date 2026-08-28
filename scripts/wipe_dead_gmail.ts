import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
async function main() {
  const r = await p.user.updateMany({
    where: { email: "taksh.nahata37@gmail.com" },
    data: {
      gmailConnected: false,
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiry: null,
    },
  });
  console.log("wiped", r);
  const u = await p.user.findFirst({
    where: { email: "taksh.nahata37@gmail.com" },
    select: {
      gmailConnected: true,
      googleRefreshToken: true,
      googleAccessToken: true,
    },
  });
  console.log(u);
  await p.$disconnect();
}
main();
