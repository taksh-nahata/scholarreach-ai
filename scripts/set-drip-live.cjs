const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const line = fs
  .readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("DRIP_DRY_RUN="));
const value = (line || "DRIP_DRY_RUN=false").split("=")[1].replace(/['"]/g, "").trim();

for (const envName of ["production", "preview", "development"]) {
  try {
    execSync(`vercel env rm DRIP_DRY_RUN ${envName} -y`, {
      cwd: root,
      stdio: "pipe",
      shell: true,
    });
  } catch {
    /* missing ok */
  }
  execSync(`vercel env add DRIP_DRY_RUN ${envName}`, {
    cwd: root,
    input: value,
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
  });
  console.log(`✓ DRIP_DRY_RUN=${value} → ${envName}`);
}
