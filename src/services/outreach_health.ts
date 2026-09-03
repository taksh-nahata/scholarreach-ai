/**
 * Detect and (where possible) repair outreach send problems.
 */
import { prisma } from "@/lib/prisma";
import { dripDispatcher } from "@/services/drip_dispatcher";
import {
  isGoogleOAuthConfigured,
  isUserGmailConnected,
} from "@/services/gmail_oauth_service";
import { dedupeScheduledOutreach } from "@/services/outreach_guard";

export type HealthIssue = {
  code: string;
  severity: "error" | "warn" | "info";
  message: string;
  fix?: string;
  autoFixed?: boolean;
};

export async function assessOutreachHealth(userId?: string) {
  const issues: HealthIssue[] = [];
  const dryRun = process.env.DRIP_DRY_RUN === "true";
  const timeZone = "professor-local (university timezone)";
  const cronSecret = !!process.env.CRON_SECRET;
  const inWindow = dripDispatcher.isAnyAcademicWindow();

  if (dryRun) {
    issues.push({
      code: "dry_run",
      severity: "error",
      message: "Live sending is disabled (DRIP_DRY_RUN=true). Emails are only simulated.",
      fix: "Set DRIP_DRY_RUN=false on the server and redeploy.",
    });
  }

  if (!cronSecret) {
    issues.push({
      code: "cron_secret",
      severity: "warn",
      message: "CRON_SECRET is missing — scheduled Vercel Cron jobs cannot authenticate.",
      fix: "Set CRON_SECRET in Vercel env.",
    });
  }

  if (!isGoogleOAuthConfigured()) {
    issues.push({
      code: "oauth_keys",
      severity: "error",
      message: "Google OAuth client ID/secret are not configured.",
      fix: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    });
  }

  const now = new Date();
  const overdueWhere = {
    status: "scheduled",
    scheduledIso: { lte: new Date(now.getTime() - 15 * 60 * 1000) },
    ...(userId ? { userId } : {}),
  };

  const overdue = await prisma.scheduledEmail.count({ where: overdueWhere });
  if (overdue > 0) {
    issues.push({
      code: "overdue",
      severity: inWindow ? "error" : "warn",
      message: `${overdue} email(s) are past their scheduled send time.`,
      fix: inWindow
        ? "Flushing due queue now."
        : "Waiting for Tue–Thu 8:00–10:45 AM in each professor's university timezone (core 8–9, grace to 10:45). Cron fires mid-window for Asia / India / EU / US East / Central / West.",
    });
  }

  const failedRecent = await prisma.scheduledEmail.findMany({
    where: {
      status: "scheduled",
      lastError: { not: null },
      ...(userId ? { userId } : {}),
    },
    take: 20,
    orderBy: { updatedAt: "desc" },
  });

  const authErrors = failedRecent.filter((e) =>
    /gmail|oauth|token|auth|connect|401|403|invalid_grant/i.test(
      e.lastError || ""
    )
  );
  if (authErrors.length) {
    issues.push({
      code: "gmail_auth",
      severity: "error",
      message: `${authErrors.length} queued send(s) failed Gmail auth (often invalid_grant). Reconnect Gmail.`,
      fix: "Open Connect Inbox → Reconnect Gmail access, approve all permissions, then wait for the next morning window (or Dispatch now).",
    });
  }

  if (userId) {
    const connected = await isUserGmailConnected(userId);
    if (!connected) {
      issues.push({
        code: "no_gmail",
        severity: "error",
        message: "Gmail is not connected for this account.",
        fix: "Connect Inbox and approve send + read access.",
      });
    }
  }

  if (!inWindow) {
    issues.push({
      code: "outside_window",
      severity: "info",
      message: `Outside Tue–Thu 8:00–10:45 AM ${timeZone} send/grace window. Overdue items roll to the next professor-local morning (not late-sent overnight).`,
    });
  }

  return {
    ok: !issues.some((i) => i.severity === "error"),
    dryRun,
    liveSend: !dryRun,
    inWindow,
    timeZone,
    cronConfigured: cronSecret,
    overdue,
    issues,
    at: now.toISOString(),
  };
}

/** Attempt automatic repairs: flush overdue when in window / force after diagnosis. */
export async function selfHealOutreach(opts?: {
  userId?: string;
  force?: boolean;
  limit?: number;
}) {
  const health = await assessOutreachHealth(opts?.userId);
  const actions: string[] = [];
  const results: unknown[] = [];

  // Recover rows stuck in "sending" after a crashed claim (older than 15 min)
  const stuckCutoff = new Date(Date.now() - 15 * 60_000);
  const stuckWhere = {
    status: "sending",
    kind: "outreach",
    updatedAt: { lte: stuckCutoff },
    ...(opts?.userId ? { userId: opts.userId } : {}),
  };
  const stuck = await prisma.scheduledEmail.findMany({
    where: stuckWhere,
    take: 30,
  });
  let recoveredStuck = 0;
  for (const row of stuck) {
    const alreadySent = row.professorId
      ? await prisma.sentHistory.findFirst({
          where: {
            userId: row.userId,
            professorId: row.professorId,
            kind: "outreach",
          },
          select: { id: true },
        })
      : null;
    if (alreadySent) {
      await prisma.scheduledEmail.update({
        where: { id: row.id },
        data: {
          status: "cancelled",
          lastError: "Cancelled — already sent (stuck sending recovery)",
        },
      });
    } else {
      const next = dripDispatcher.getNextAcademicWindowSlot(
        new Date(),
        row.university
      );
      await prisma.scheduledEmail.update({
        where: { id: row.id },
        data: {
          status: "scheduled",
          scheduledIso: next,
          scheduledTime: dripDispatcher.formatSlot(next, row.university),
          lastError: "Recovered from stuck sending",
        },
      });
    }
    recoveredStuck += 1;
  }
  if (recoveredStuck) actions.push(`recovered_stuck_sending_${recoveredStuck}`);

  if (opts?.userId) {
    const deduped = await dedupeScheduledOutreach(opts.userId);
    if (deduped.cancelled > 0) {
      actions.push(`deduped_queue_${deduped.cancelled}`);
    }
  } else {
    const users = await prisma.scheduledEmail.findMany({
      where: {
        kind: "outreach",
        status: { in: ["scheduled", "sending"] },
        professorId: { not: null },
      },
      select: { userId: true },
      distinct: ["userId"],
    });
    let cancelled = 0;
    for (const row of users) {
      const deduped = await dedupeScheduledOutreach(row.userId);
      cancelled += deduped.cancelled;
    }
    if (cancelled > 0) actions.push(`deduped_queue_${cancelled}`);
  }

  const shouldFlush =
    health.overdue > 0 &&
    !health.dryRun &&
    (health.inWindow || opts?.force);

  if (health.dryRun) {
    actions.push("skipped_flush_dry_run");
  } else if (shouldFlush) {
    if (opts?.userId) {
      for (let i = 0; i < (opts.limit || 15); i++) {
        const r = await dripDispatcher.processNextQueueItem(opts.userId, {
          force: opts.force,
        });
        results.push(r);
        if (r && "skipped" in r && r.reason === "empty_queue") break;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    } else {
      const batch = await dripDispatcher.processDueBatch(opts?.limit || 15, {
        force: opts?.force,
      });
      results.push(...batch);
    }
    actions.push(`flushed_${results.length}`);
  } else if (health.overdue > 0 && !health.inWindow && !opts?.force) {
    // Professors in other US timezones may still be in their local morning window.
    actions.push("deferred_roll_outside_global_window");
  }

  // Clear stale lastError on items that are still scheduled but Gmail is now connected
  if (opts?.userId && (await isUserGmailConnected(opts.userId))) {
    const cleared = await prisma.scheduledEmail.updateMany({
      where: {
        userId: opts.userId,
        status: "scheduled",
        lastError: { contains: "Connect Gmail" },
      },
      data: { lastError: null },
    });
    if (cleared.count) {
      actions.push(`cleared_connect_errors_${cleared.count}`);
      health.issues
        .filter((i) => i.code === "gmail_auth" || i.code === "no_gmail")
        .forEach((i) => {
          i.autoFixed = true;
        });
    }
  }

  const after = await assessOutreachHealth(opts?.userId);
  return { before: health, after, actions, results };
}
