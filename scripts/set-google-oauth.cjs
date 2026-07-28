/**
 * Write Google OAuth credentials to local .env and Vercel.
 * Usage: node scripts/set-google-oauth.cjs <CLIENT_ID> <CLIENT_SECRET>
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const [clientId, clientSecret] = process.argv.slice(2);
if (!clientId || !clientSecret) {
  console.error(
    "Usage: node scripts/set-google-oauth.cjs <CLIENT_ID> <CLIENT_SECRET>"
  );
  process.exit(1);
}

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");
const live =
  process.env.NEXT_PUBLIC_LIVE_APP_URL || "https://scholarreach-ai.vercel.app";
const redirect = `${live}/api/auth/callback/google`;

let e = fs.readFileSync(envPath, "utf8");
const set = (key, val) => {
  const line = `${key}="${val}"`;
  if (new RegExp(`^${key}=`, "m").test(e)) {
    e = e.replace(new RegExp(`^${key}=.*$`, "m"), line);
  } else {
    e += `\n${line}\n`;
  }
};
set("GOOGLE_CLIENT_ID", clientId);
set("GOOGLE_CLIENT_SECRET", clientSecret);
set("GOOGLE_REDIRECT_URI", redirect);
fs.writeFileSync(envPath, e);
console.log("Updated local .env");

function upsert(key, value) {
  for (const envName of ["production", "preview", "development"]) {
    try {
      execSync(`vercel env rm ${key} ${envName} -y`, {
        cwd: root,
        stdio: "pipe",
        shell: true,
      });
    } catch {
      /* ok */
    }
    execSync(`vercel env add ${key} ${envName}`, {
      cwd: root,
      input: String(value),
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });
    console.log(`✓ ${key} → ${envName}`);
  }
}

upsert("GOOGLE_CLIENT_ID", clientId);
upsert("GOOGLE_CLIENT_SECRET", clientSecret);
upsert("GOOGLE_REDIRECT_URI", redirect);
console.log("\nRedeploy with: vercel --prod --yes");
