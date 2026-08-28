const { execSync } = require("child_process");
const path = require("path");
const root = path.join(__dirname, "..");
const value = "U2zmStviN-onNwcuImdTdo-Lt1iflXPkxbUOwHAt0NU";

for (const envName of ["production", "preview", "development"]) {
  try {
    execSync(`vercel env rm GOOGLE_SITE_VERIFICATION ${envName} -y`, {
      cwd: root,
      stdio: "pipe",
      shell: true,
    });
  } catch {
    /* ok */
  }
  execSync(`vercel env add GOOGLE_SITE_VERIFICATION ${envName}`, {
    cwd: root,
    input: value,
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
  });
  console.log(`✓ GOOGLE_SITE_VERIFICATION → ${envName}`);
}
