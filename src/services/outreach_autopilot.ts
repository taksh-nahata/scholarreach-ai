/**
 * Daily hands-off outreach pipeline:
 * mine (if pool low) → reverify emails → draft verified high-fit → heuristic gate → queue.
 */
import { prisma } from "@/lib/prisma";
import { PENDING_APPROVAL_STATUSES } from "@/lib/draft_status";
import {
  startApprovalSweepJob,
  startDraftGenerateJob,
  startEmailReverifyJob,
  startMineLeadsJob,
  tickUserJobs,
} from "@/services/background_jobs";
import { isUserGmailConnected } from "@/services/gmail_oauth_service";
import { isPlatformMailConfigured } from "@/services/platform_mail";

export type AutopilotStepResult = {
  userId: string;
  skipped?: boolean;
  reason?: string;
  actions: string[];
  stats?: {
    readyPool: number;
    needVerify: number;
    draftedCandidates: number;
    pendingDrafts: number;
    approvalMode: string;
  };
};

const COOLDOWN_MS = 20 * 60 * 60 * 1000;

async function jobRunning(userId: string, type: string) {
  const row = await prisma.backgroundJob.findFirst({
    where: { userId, type, status: "running" },
    select: { id: true },
  });
  return !!row;
}

async function mailReady(userId: string) {
  if (await isUserGmailConnected(userId)) return true;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  if (
    user.mailProvider === "platform" &&
    user.mailConnected &&
    isPlatformMailConfigured()
  ) {
    return true;
  }
  if (user.mailConnected && user.smtpPassEnc && user.smtpHost) return true;
  if (user.mailProvider === "outlook" && user.microsoftAccessToken) return true;
  return false;
}

/** Turn on hands-off mode for users who connected mail but never enabled autopilot. */
async function ensureAutopilotReady(userId: string) {
  const profile = await prisma.studentProfile.findUnique({ where: { userId } });
  if (!profile) return profile;
  const needsEnable =
    !profile.autopilotEnabled || profile.autoApproveMode === "manual";
  if (!needsEnable) return profile;
  return prisma.studentProfile.update({
    where: { userId },
    data: {
      autopilotEnabled: true,
      autoApproveMode:
        profile.autoApproveMode === "manual"
          ? "agent_gate"
          : profile.autoApproveMode,
    },
  });
}

export async function runAutopilotForUser(
  userId: string,
  opts?: { force?: boolean; tickRounds?: number }
): Promise<AutopilotStepResult> {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    include: { user: true },
  });
  if (!profile) {
    return { userId, skipped: true, reason: "no_profile", actions: [] };
  }
  if (!profile.user.onboardingComplete) {
    return {
      userId,
      skipped: true,
      reason: "onboarding_incomplete",
      actions: [],
    };
  }
  if (!(await mailReady(userId))) {
    return { userId, skipped: true, reason: "mail_not_connected", actions: [] };
  }
  if (process.env.DRIP_DRY_RUN === "true") {
    return { userId, skipped: true, reason: "dry_run", actions: [] };
  }

  await ensureAutopilotReady(userId);
  const settings = await prisma.studentProfile.findUnique({
    where: { userId },
  });
  if (!settings) {
    return { userId, skipped: true, reason: "no_profile", actions: [] };
  }

  const actions: string[] = [];
  if (!settings.autopilotEnabled) {
    actions.push("autopilot_auto_enabled");
  }
  if (settings.autoApproveMode === "agent_gate") {
    actions.push("heuristic_gate_only");
  }

  if (
    !opts?.force &&
    settings.autopilotLastRunAt &&
    Date.now() - settings.autopilotLastRunAt.getTime() < COOLDOWN_MS
  ) {
    const tickRounds = opts?.tickRounds ?? 6;
    for (let i = 0; i < tickRounds; i++) {
      await tickUserJobs(userId);
    }
    return {
      userId,
      skipped: true,
      reason: "cooldown",
      actions: [`tick_running_jobs_${tickRounds}`],
    };
  }

  const professors = await prisma.professor.findMany({
    where: { userId },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      matchScore: true,
    },
  });

  const sent = await prisma.sentHistory.findMany({
    where: { userId, kind: "outreach", professorId: { not: null } },
    select: { professorId: true },
    distinct: ["professorId"],
  });
  const contacted = new Set(
    sent.map((r) => r.professorId).filter(Boolean) as string[]
  );

  const pendingDraftRows = await prisma.draft.findMany({
    where: {
      userId,
      status: { in: [...PENDING_APPROVAL_STATUSES] },
      professorId: { not: null },
    },
    select: { professorId: true },
    distinct: ["professorId"],
  });
  const pendingDraft = new Set(
    pendingDraftRows.map((r) => r.professorId).filter(Boolean) as string[]
  );

  const minFit = settings.autopilotMinFit ?? 50;
  const mineWhenBelow = settings.autopilotMineWhenBelow ?? 25;
  const mineCount = Math.min(settings.autopilotMineCount ?? 30, 35);
  const maxDrafts = Math.min(settings.autopilotMaxDraftsPerRun ?? 30, 35);

  const readyPool = professors.filter(
    (p) =>
      p.emailVerified &&
      p.email &&
      !contacted.has(p.id) &&
      !pendingDraft.has(p.id)
  );

  const needVerify = professors
    .filter((p) => !p.emailVerified || !p.email)
    .map((p) => p.id)
    .slice(0, 35);

  const draftCandidates = readyPool
    .filter((p) => (p.matchScore ?? 0) >= minFit)
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
    .slice(0, maxDrafts)
    .map((p) => p.id);

  // 1) Mine when verified-ready pool is thin
  if (readyPool.length < mineWhenBelow && !(await jobRunning(userId, "mine_leads"))) {
    await startMineLeadsJob(userId, mineCount);
    actions.push(`mine_started_${mineCount}`);
  }

  // 2) Resolve emails for leads missing verification
  if (needVerify.length && !(await jobRunning(userId, "email_reverify"))) {
    await startEmailReverifyJob(userId, {
      all: false,
      professorIds: needVerify,
    });
    actions.push(`reverify_started_${needVerify.length}`);
  }

  // 3) Draft best verified matches
  if (draftCandidates.length && !(await jobRunning(userId, "draft_generate"))) {
    await startDraftGenerateJob(userId, draftCandidates);
    actions.push(`draft_started_${draftCandidates.length}`);
  }

  // 4) Heuristic gate → queue (agent_gate / auto modes; no manual review)
  const approvalMode = settings.autoApproveMode || "agent_gate";
  const pendingDrafts = await prisma.draft.count({
    where: {
      userId,
      status: { in: [...PENDING_APPROVAL_STATUSES] },
    },
  });

  if (approvalMode === "manual") {
    actions.push("queue_skipped_manual_approval_mode");
  } else if (
    pendingDrafts > 0 &&
    !(await jobRunning(userId, "approval_sweep"))
  ) {
    await startApprovalSweepJob(userId);
    actions.push("approval_sweep_started");
  }

  const tickRounds = opts?.tickRounds ?? 12;
  for (let i = 0; i < tickRounds; i++) {
    await tickUserJobs(userId);
  }

  await prisma.studentProfile.update({
    where: { userId },
    data: { autopilotLastRunAt: new Date() },
  });

  return {
    userId,
    actions,
    stats: {
      readyPool: readyPool.length,
      needVerify: needVerify.length,
      draftedCandidates: draftCandidates.length,
      pendingDrafts,
      approvalMode,
    },
  };
}

/** Users with mail + onboarding — autopilot runs even if they never toggled Settings. */
export async function listEligibleAutopilotUsers(limit = 8) {
  const profiles = await prisma.studentProfile.findMany({
    where: {
      user: {
        onboardingComplete: true,
        OR: [
          { gmailConnected: true },
          { mailConnected: true },
          { smtpPassEnc: { not: null } },
          { microsoftAccessToken: { not: null } },
        ],
      },
    },
    select: { userId: true, autopilotLastRunAt: true },
    orderBy: { autopilotLastRunAt: "asc" },
    take: limit * 2,
  });

  const eligible: Array<{ userId: string; autopilotLastRunAt: Date | null }> = [];
  for (const row of profiles) {
    if (eligible.length >= limit) break;
    if (await mailReady(row.userId)) {
      eligible.push(row);
    }
  }
  return eligible;
}

/** Run autopilot for all eligible users (cron entry). */
export async function runDailyAutopilot(
  limitUsers = 8,
  opts?: { force?: boolean; tickRounds?: number }
) {
  const enabled = await listEligibleAutopilotUsers(limitUsers);

  const results: AutopilotStepResult[] = [];
  for (const row of enabled) {
    try {
      const force =
        opts?.force ||
        !row.autopilotLastRunAt ||
        Date.now() - row.autopilotLastRunAt.getTime() >= COOLDOWN_MS;
      results.push(
        await runAutopilotForUser(row.userId, {
          force,
          tickRounds: opts?.tickRounds,
        })
      );
    } catch (err) {
      results.push({
        userId: row.userId,
        actions: [],
        reason: err instanceof Error ? err.message : "autopilot_error",
      });
    }
  }
  return { users: enabled.length, results };
}
