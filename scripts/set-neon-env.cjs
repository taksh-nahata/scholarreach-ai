/**
 * Apply DATABASE_URL from env or CLI — never hardcode Neon passwords in git.
 * Usage:
 *   set DATABASE_URL=postgresql://...
 *   node scripts/set-neon-env.cjs
 * Or:
 *   node scripts/set-neon-env.cjs "postgresql://..."
 */
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");
const url = process.argv[2] || process.env.DATABASE_URL;

if (!url || !url.startsWith("postgres")) {
  console.error(
    "Pass a Neon DATABASE_URL as argv or env. Do not commit credentials."
  );
  process.exit(1);
}

let e = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const set = (key, val) => {
  const line = `${key}="${val}"`;
  if (new RegExp(`^${key}=`, "m").test(e)) {
    e = e.replace(new RegExp(`^${key}=.*$`, "m"), line);
  } else {
    e += `\n${line}\n`;
  }
};

set("DATABASE_URL", url);
if (!/^NEXTAUTH_SECRET=/m.test(e) || /NEXTAUTH_SECRET=""/.test(e)) {
  set("NEXTAUTH_SECRET", crypto.randomBytes(32).toString("hex"));
}
set("NEXT_PUBLIC_LIVE_APP_URL", "https://scholarreach-ai.vercel.app");
set("ALLOW_DEFAULT_USER", "false");
set("DRIP_DRY_RUN", "true");
// Remove legacy access-code auth (replaced by password + OAuth)
e = e.replace(/^WORKSPACE_ACCESS_CODE=.*$/gm, "");

fs.writeFileSync(envPath, e.trim() + "\n");
console.log("Updated .env (ALLOW_DEFAULT_USER=false, DRIP_DRY_RUN=true)");
