/**
 * Build a static GitHub Pages site.
 * Temporarily parks API routes (unsupported by `output: 'export'`).
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const apiDir = path.join(root, "src", "app", "api");
const parked = path.join(root, ".api_parked");

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: root, env: process.env });
}

try {
  if (fs.existsSync(apiDir)) {
    if (fs.existsSync(parked)) fs.rmSync(parked, { recursive: true, force: true });
    fs.renameSync(apiDir, parked);
    console.log("Parked API routes for static export");
  }

  process.env.STATIC_EXPORT = "true";
  process.env.NEXT_PUBLIC_STATIC_EXPORT = "true";
  process.env.BASE_PATH = process.env.BASE_PATH || "/scholarreach-ai";
  process.env.NEXT_PUBLIC_LIVE_APP_URL =
    process.env.NEXT_PUBLIC_LIVE_APP_URL || "https://scholarreach-ai.vercel.app";

  try {
    if (fs.existsSync(path.join(root, "prisma", "dev.db"))) {
      // Keep committed commercial demo snapshot for GH Pages.
      // Local DB export is opt-in: DEMO_EXPORT_FROM_DB=1
      if (process.env.DEMO_EXPORT_FROM_DB === "1") {
        run("npx tsx scripts/export-demo-data.ts");
      } else {
        console.log("Using committed public/demo-data.json (commercial sample)");
      }
    } else {
      console.log("No local DB — using committed public/demo-data.json");
    }
  } catch (e) {
    console.warn("Demo export skipped:", e.message || e);
  }

  run("npx next build");

  // Copy .nojekyll for GH Pages
  const out = path.join(root, "out");
  fs.writeFileSync(path.join(out, ".nojekyll"), "");
  console.log("Static site ready in /out");
} finally {
  if (fs.existsSync(parked)) {
    if (fs.existsSync(apiDir)) fs.rmSync(apiDir, { recursive: true, force: true });
    fs.renameSync(parked, apiDir);
    console.log("Restored API routes");
  }
}
