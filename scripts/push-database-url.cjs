/**
 * Push only DATABASE_URL from local .env to Vercel (after Neon rotation).
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const e = fs.readFileSync(path.join(root, ".env"), "utf8");
const m = e.match(/^DATABASE_URL="?([^\r\n"]+)/m);
if (!m) {
  console.error("No DATABASE_URL in .env");
  process.exit(1);
}
let url = m[1];
if (url.includes("ep-purple-tooth-a6exfc7i.us-west-2") && !url.includes("-pooler")) {
  url = url.replace(
    "ep-purple-tooth-a6exfc7i.us-west-2",
    "ep-purple-tooth-a6exfc7i-pooler.us-west-2"
  );
}
if (!url.includes("pgbouncer=") && url.includes("-pooler")) {
  url += url.includes("?") ? "&pgbouncer=true" : "?pgbouncer=true";
}

for (const envName of ["production", "preview", "development"]) {
  try {
    execSync(`vercel env rm DATABASE_URL ${envName} -y`, {
      cwd: root,
      stdio: "pipe",
      shell: true,
    });
  } catch {
    /* ok */
  }
  execSync(`vercel env add DATABASE_URL ${envName}`, {
    cwd: root,
    input: url,
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
  });
  console.log(`DATABASE_URL → ${envName}`);
}
console.log("done");
