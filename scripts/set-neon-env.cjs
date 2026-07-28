const fs = require("fs");
const crypto = require("crypto");

const url =
  "postgresql://neondb_owner:REDACTED_ROTATED@ep-purple-tooth-a6exfc7i.us-west-2.aws.neon.tech/neondb?sslmode=require";
const secret = crypto.randomBytes(32).toString("hex");

let e = fs.readFileSync(".env", "utf8");
e = e.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${url}"`);
e = e.replace(/^NEXTAUTH_SECRET=.*$/m, `NEXTAUTH_SECRET="${secret}"`);
e = e.replace(
  /^DEFAULT_USER_EMAIL=.*$/m,
  `DEFAULT_USER_EMAIL="taksh.nahata37@gmail.com"`
);
if (!/^NEXT_PUBLIC_LIVE_APP_URL=/m.test(e)) {
  e += `\nNEXT_PUBLIC_LIVE_APP_URL="https://scholarreach-ai.vercel.app"\n`;
} else {
  e = e.replace(
    /^NEXT_PUBLIC_LIVE_APP_URL=.*$/m,
    `NEXT_PUBLIC_LIVE_APP_URL="https://scholarreach-ai.vercel.app"`
  );
}
if (!/^ALLOW_DEFAULT_USER=/m.test(e)) {
  e += `\nALLOW_DEFAULT_USER="true"\n`;
}
fs.writeFileSync(".env", e);
fs.writeFileSync(".neon-secret.tmp", secret);
console.log("Updated .env with Neon DATABASE_URL");
