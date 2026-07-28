/**
 * Per-user daily API budgets so a free commercial deploy does not burn Exa/Tavily/Firecrawl.
 * Limits are operator-configurable via env; defaults are conservative.
 */
import { prisma } from "@/lib/prisma";

export type ApiKind = "exa" | "tavily" | "firecrawl" | "llm";

const DEFAULTS: Record<ApiKind, number> = {
  exa: Number(process.env.SEARCH_DAILY_BUDGET_EXA || 15),
  tavily: Number(process.env.SEARCH_DAILY_BUDGET_TAVILY || 25),
  firecrawl: Number(process.env.SEARCH_DAILY_BUDGET_FIRECRAWL || 20),
  llm: Number(process.env.SEARCH_DAILY_BUDGET_LLM || 80),
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getRow(userId: string) {
  const day = todayKey();
  return prisma.apiUsageDaily.upsert({
    where: { userId_day: { userId, day } },
    update: {},
    create: { userId, day },
  });
}

export async function getApiUsage(userId: string) {
  const row = await getRow(userId);
  return {
    day: row.day,
    used: {
      exa: row.exa,
      tavily: row.tavily,
      firecrawl: row.firecrawl,
      llm: row.llm,
    },
    limits: { ...DEFAULTS },
    remaining: {
      exa: Math.max(0, DEFAULTS.exa - row.exa),
      tavily: Math.max(0, DEFAULTS.tavily - row.tavily),
      firecrawl: Math.max(0, DEFAULTS.firecrawl - row.firecrawl),
      llm: Math.max(0, DEFAULTS.llm - row.llm),
    },
  };
}

/** Returns false if over budget (caller should skip the paid call). */
export async function tryConsumeApi(
  userId: string | null | undefined,
  kind: ApiKind,
  amount = 1
): Promise<boolean> {
  if (!userId) {
    // Global/system calls: allow but do not track
    return true;
  }
  const day = todayKey();
  const limit = DEFAULTS[kind];
  const row = await getRow(userId);
  const current = row[kind];
  if (current + amount > limit) {
    console.warn(
      `[ApiBudget] ${kind} exhausted for user ${userId} (${current}/${limit})`
    );
    return false;
  }
  await prisma.apiUsageDaily.update({
    where: { userId_day: { userId, day } },
    data: { [kind]: { increment: amount } },
  });
  return true;
}
