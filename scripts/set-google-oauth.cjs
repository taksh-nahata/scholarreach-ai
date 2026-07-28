/**
 * Write Google OAuth credentials to local .env and Vercel, then print setup checklist.
 * Usage: node scripts/set-google-oauth.cjs <CLIENT_ID> <CLIENT_SECRET>
 *
 * Google Cloud checklist (do this first):
 * 1. https://console.cloud.google.com/apis/library/gmail.googleapis.com — Enable Gmail API
 * 2. APIs & Services → OAuth consent screen → External → add your Gmail as Test user
 * 3. Credentials → Create OAuth client ID → Web application
 * 4. Authorized JavaScript origins:
 *      https://scholarreach-ai.vercel.app
 *      http://localhost:3001
 * 5. Authorized redirect URIs (BOTH):
 *      https://scholarreach-ai.vercel.app/api/auth/callback/google
 *      https://scholarreach-ai.vercel.app/api/mail/gmail/callback
 *      http://localhost:3001/api/auth/callback/google
 *      http://localhost:3001/api/mail/gmail/callback
 * 6. Paste Client ID + Secret into this script
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

let e = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
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
set("GOOGLE_REDIRECT_URI", `${live}/api/auth/callback/google`);
fs.writeFileSync(envPath, e.trim() + "\n");
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
upsert("GOOGLE_REDIRECT_URI", `${live}/api/auth/callback/google`);
console.log("\nRedeploy: npx vercel --prod --yes");
console.log(
  "Then: password login → Connect Inbox → Request Gmail access (parent can approve)."
);
