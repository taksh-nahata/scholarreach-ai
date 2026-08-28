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
  GROQ_API_KEY: local.GROQ_API_KEY || "",
  GROQ_BASE_URL: local.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
  GROQ_MODEL_FAST: local.GROQ_MODEL_FAST || "openai/gpt-oss-20b",
  GROQ_MODEL_QUALITY: local.GROQ_MODEL_QUALITY || "openai/gpt-oss-120b",
  GROQ_MIN_INTERVAL_MS: local.GROQ_MIN_INTERVAL_MS || "2200",
  OPENROUTER_API_KEY: local.OPENROUTER_API_KEY || "",
  OPENROUTER_MODEL_FAST:
    local.OPENROUTER_MODEL_FAST || "meta-llama/llama-3.2-3b-instruct",
  OPENROUTER_MODEL_QUALITY:
    local.OPENROUTER_MODEL_QUALITY || "meta-llama/llama-3.2-3b-instruct",
  OPENROUTER_SITE_URL: liveUrl,
  OPENROUTER_APP_NAME: local.OPENROUTER_APP_NAME || "ScholarReach",
  MISTRAL_API_KEY: local.MISTRAL_API_KEY || "",
  MISTRAL_MODEL_FAST: local.MISTRAL_MODEL_FAST || "mistral-small-latest",
  MISTRAL_MODEL_QUALITY: local.MISTRAL_MODEL_QUALITY || "mistral-small-latest",
  GEMINI_API_KEY: local.GEMINI_API_KEY || "",
  GEMINI_MODEL_FAST: local.GEMINI_MODEL_FAST || "gemini-2.5-flash",
  GEMINI_MODEL_QUALITY: local.GEMINI_MODEL_QUALITY || "gemini-2.5-flash",
  NOVITA_API_KEY: local.NOVITA_API_KEY || "",
  NOVITA_BASE_URL: local.NOVITA_BASE_URL || "https://api.novita.ai/openai/v1",
  NOVITA_MODEL_FAST:
    local.NOVITA_MODEL_FAST || "meta-llama/llama-3.2-1b-instruct",
  NOVITA_MODEL_QUALITY:
    local.NOVITA_MODEL_QUALITY || "meta-llama/llama-3.1-8b-instruct",
  USE_LLM_EMAIL_DRAFTS: local.USE_LLM_EMAIL_DRAFTS || "false",
  EXA_API_KEY: local.EXA_API_KEY || "",
  TAVILY_API_KEY: local.TAVILY_API_KEY || "",
  FIRECRAWL_API_KEY: local.FIRECRAWL_API_KEY || "",
  DAILY_SEND_CAP: local.DAILY_SEND_CAP || "500",
  // Live Gmail sends (set true only to simulate)
  DRIP_DRY_RUN: local.DRIP_DRY_RUN || "false",
  DRIP_TIMEZONE: local.DRIP_TIMEZONE || "America/Los_Angeles",
  CRON_SECRET: local.CRON_SECRET || "",
  GOOGLE_SITE_VERIFICATION: local.GOOGLE_SITE_VERIFICATION || "",
  NEXT_PUBLIC_LIVE_APP_URL: liveUrl,
  SEARCH_DAILY_BUDGET_EXA: local.SEARCH_DAILY_BUDGET_EXA || "15",
  SEARCH_DAILY_BUDGET_TAVILY: local.SEARCH_DAILY_BUDGET_TAVILY || "40",
  SEARCH_DAILY_BUDGET_FIRECRAWL: local.SEARCH_DAILY_BUDGET_FIRECRAWL || "25",
  SEARCH_DAILY_BUDGET_LLM: local.SEARCH_DAILY_BUDGET_LLM || "80",
  TAVILY_SEARCH_DEPTH: local.TAVILY_SEARCH_DEPTH || "basic",
  TAVILY_TIMEOUT_MS: local.TAVILY_TIMEOUT_MS || "12000",
  FIRECRAWL_TIMEOUT_MS: local.FIRECRAWL_TIMEOUT_MS || "15000",
  MINE_TICK_TIMEOUT_MS: local.MINE_TICK_TIMEOUT_MS || "55000",
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
