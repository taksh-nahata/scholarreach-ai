/**
 * Push production env vars to Vercel (non-interactive).
 * Usage: node scripts/push-vercel-env.cjs
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");

function parseEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const local = parseEnv(envPath);
const liveUrl = "https://scholarreach-ai.vercel.app";

// Prefer Neon pooler for serverless
let databaseUrl = local.DATABASE_URL || "";
if (databaseUrl.includes("ep-purple-tooth-a6exfc7i.us-west-2")) {
  databaseUrl = databaseUrl.replace(
    "ep-purple-tooth-a6exfc7i.us-west-2",
    "ep-purple-tooth-a6exfc7i-pooler.us-west-2"
  );
  if (!databaseUrl.includes("pgbouncer=")) {
    databaseUrl += databaseUrl.includes("?")
      ? "&pgbouncer=true"
      : "?pgbouncer=true";
  }
}

const vars = {
  DATABASE_URL: databaseUrl,
  NEXTAUTH_URL: liveUrl,
  NEXTAUTH_SECRET: local.NEXTAUTH_SECRET,
  DEFAULT_USER_EMAIL: local.DEFAULT_USER_EMAIL || "taksh.nahata37@gmail.com",
  DEFAULT_USER_NAME: local.DEFAULT_USER_NAME || "Taksh Nahata",
  // Fail closed in production — never auto-login as the owner
  ALLOW_DEFAULT_USER: "false",
  GOOGLE_CLIENT_ID: local.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: local.GOOGLE_CLIENT_SECRET || "",
  GOOGLE_REDIRECT_URI: `${liveUrl}/api/auth/callback/google`,
  AZURE_AD_CLIENT_ID: local.AZURE_AD_CLIENT_ID || "",
  AZURE_AD_CLIENT_SECRET: local.AZURE_AD_CLIENT_SECRET || "",
  AZURE_AD_TENANT_ID: local.AZURE_AD_TENANT_ID || "common",
  PROVOCATIVE_BASE_URL: local.PROVOCATIVE_BASE_URL || "",
  PROVOCATIVE_API_KEY: local.PROVOCATIVE_API_KEY || "",
  PRIMARY_MODEL: local.PRIMARY_MODEL || "qwen3.6-35b",
  EXA_API_KEY: local.EXA_API_KEY || "",
  TAVILY_API_KEY: local.TAVILY_API_KEY || "",
  FIRECRAWL_API_KEY: local.FIRECRAWL_API_KEY || "",
  DAILY_SEND_CAP: local.DAILY_SEND_CAP || "500",
  // Keep sends free/safe until inbox connect is intentionally enabled
  DRIP_DRY_RUN: "true",
  NEXT_PUBLIC_LIVE_APP_URL: liveUrl,
  SEARCH_DAILY_BUDGET_EXA: local.SEARCH_DAILY_BUDGET_EXA || "15",
  SEARCH_DAILY_BUDGET_TAVILY: local.SEARCH_DAILY_BUDGET_TAVILY || "25",
  SEARCH_DAILY_BUDGET_FIRECRAWL: local.SEARCH_DAILY_BUDGET_FIRECRAWL || "20",
  SEARCH_DAILY_BUDGET_LLM: local.SEARCH_DAILY_BUDGET_LLM || "80",
  MIN_MATCH_SCORE: local.MIN_MATCH_SCORE || "40",
  RESEND_API_KEY: local.RESEND_API_KEY || "",
  RESEND_FROM: local.RESEND_FROM || "",
};

function upsert(key, value, envName) {
  if (value === undefined || value === null) return;
  // Skip empty secrets (Vercel rejects blank values)
  if (value === "" && (key.includes("SECRET") || key.includes("KEY") || key.includes("CLIENT"))) {
    console.log(`skip empty ${key}`);
    return;
  }
  // Remove existing then add (idempotent)
  try {
    execSync(`vercel env rm ${key} ${envName} -y`, {
      cwd: root,
      stdio: "pipe",
      shell: true,
    });
  } catch {
    /* missing is fine */
  }
  // Pipe value via stdin
  execSync(`vercel env add ${key} ${envName}`, {
    cwd: root,
    input: String(value),
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
  });
  console.log(`✓ ${key} → ${envName}`);
}

for (const envName of ["production", "preview", "development"]) {
  console.log(`\n=== ${envName} ===`);
  for (const [k, v] of Object.entries(vars)) {
    if (k === "GOOGLE_CLIENT_ID" || k === "GOOGLE_CLIENT_SECRET") {
      // Still set empty so keys exist; user can update later
    }
    try {
      upsert(k, v, envName);
    } catch (e) {
      console.error(`✗ ${k} (${envName}):`, e.message || e);
    }
  }
}

console.log("\nDone pushing env vars.");
