/**
 * ScholarReach AI — Academic High-Speed Drip Dispatcher
 * Window: Tue–Thu 8:00–9:00 AM in the PROFESSOR's university timezone.
 * 5–9s jitter. Cap 500/day with rollover.
 */
import { prisma } from "@/lib/prisma";
import { sendMailForUser } from "./mail_sender";
import { isPlatformMailConfigured } from "./platform_mail";
import {
  defaultDripTimezone,
  timezoneForUniversity,
} from "@/lib/university_timezone";
import {
  isFollowUpEligibleAddress,
  isLegacyContactedSubject,
} from "@/services/follow_up_guards";
import {
  isPermanentAddressFailure,
  isSyntacticallyValidRecipient,
  normalizeEmail,
  strictDeliverabilityEnabled,
} from "@/services/deliverability_guard";
import { emailConfidenceTier } from "@/services/email_confidence";

async function isMailReady(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  if (user.gmailConnected && (user.googleAccessToken || user.googleRefreshToken)) {
    return true;
  }
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

function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const hour = map.hour === "24" ? 0 : parseInt(map.hour || "0", 10);
  return {
    weekday: weekdayMap[map.weekday || "Sun"] ?? 0,
    year: parseInt(map.year || "0", 10),
    month: parseInt(map.month || "1", 10),
    day: parseInt(map.day || "1", 10),
    hour,
    minute: parseInt(map.minute || "0", 10),
  };
}

/** Approximate instant for Y-M-D H:M in a named timezone (Vercel is UTC). */
function zonedDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(utc), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    utc += wanted - asUtc;
  }
  return new Date(utc);
}

export class EnterpriseDripDispatcher {
  isProcessing = false;
  minDelayMs = 5 * 1000;
  maxDelayMs = 9 * 1000;
  dailyCap = parseInt(process.env.DAILY_SEND_CAP || "500", 10);
  dryRun = process.env.DRIP_DRY_RUN === "true";
  /** Fallback TZ for daily counters / unknown universities */
  timeZone = defaultDripTimezone();
  private watcher: NodeJS.Timeout | null = null;

  isLiveSend() {
    // Re-read each call so env flips apply without stale module state
    this.dryRun = process.env.DRIP_DRY_RUN === "true";
    return !this.dryRun;
  }

  resolveTimezone(university?: string | null) {
    return timezoneForUniversity(university, this.timeZone);
  }

  startWatcher() {
    console.log(
      `[DripDispatcher] Active (Cap: ${this.dailyCap}/day, Window: Tue-Thu 8:00-9:00 professor-local TZ, dryRun=${this.dryRun})...`
    );
    this.watcher = setInterval(() => this.processNextQueueItem(), 5 * 1000);
    this.processNextQueueItem();
  }

  stopWatcher() {
    if (this.watcher) clearInterval(this.watcher);
    this.watcher = null;
  }

  isAcademicWindow(now = new Date(), universityOrTz?: string | null) {
    const tz =
      universityOrTz && universityOrTz.includes("/")
        ? universityOrTz
        : this.resolveTimezone(universityOrTz);
    const p = zonedParts(now, tz);
    const isTueThu = p.weekday === 2 || p.weekday === 3 || p.weekday === 4;
    if (!isTueThu) return false;
    const currentMin = p.hour * 60 + p.minute;
    // Core reputation window: 8:00–9:00 professor-local
    return currentMin >= 8 * 60 && currentMin < 9 * 60;
  }

  /**
   * Allow dispatch a bit past 9:00 so a slightly late cron still delivers
   * same-morning instead of rolling a full day. Hard stop at 10:45 local.
   */
  canDispatchNow(now = new Date(), universityOrTz?: string | null) {
    const tz =
      universityOrTz && universityOrTz.includes("/")
        ? universityOrTz
        : this.resolveTimezone(universityOrTz);
    const p = zonedParts(now, tz);
    const isTueThu = p.weekday === 2 || p.weekday === 3 || p.weekday === 4;
    if (!isTueThu) return false;
    const currentMin = p.hour * 60 + p.minute;
    return currentMin >= 8 * 60 && currentMin < 10 * 60 + 45;
  }

  /** True if any common academic TZ is currently in the send/grace window. */
  isAnyAcademicWindow(now = new Date()) {
    const zones = [
      "America/Los_Angeles",
      "America/Denver",
      "America/Chicago",
      "America/New_York",
      "America/Toronto",
      "Europe/London",
      "Europe/Berlin",
      "Asia/Jerusalem",
      "Asia/Kolkata",
      "Asia/Shanghai",
      "Asia/Tokyo",
      "Australia/Sydney",
    ];
    return zones.some((tz) => this.canDispatchNow(now, tz));
  }

  getNextAcademicWindowSlot(
    fromDate = new Date(),
    university?: string | null
  ) {
    const tz = this.resolveTimezone(university);
    const base = zonedParts(fromDate, tz);
    // If still before today's window ends and today is Tue–Thu, use today
    {
      const todayMin = base.hour * 60 + base.minute;
      const isTueThu =
        base.weekday === 2 || base.weekday === 3 || base.weekday === 4;
      if (isTueThu && todayMin < 8 * 60) {
        return zonedDate(
          base.year,
          base.month,
          base.day,
          8,
          Math.floor(Math.random() * 20),
          tz
        );
      }
    }

    let y = base.year;
    let m = base.month;
    let d = base.day + 1;
    for (let i = 0; i < 14; i++) {
      const probe = zonedDate(y, m, d, 12, 0, tz);
      const p = zonedParts(probe, tz);
      if (p.weekday === 2 || p.weekday === 3 || p.weekday === 4) {
        return zonedDate(
          p.year,
          p.month,
          p.day,
          8,
          Math.floor(Math.random() * 20),
          tz
        );
      }
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      y = next.getUTCFullYear();
      m = next.getUTCMonth() + 1;
      d = next.getUTCDate();
    }
    return zonedDate(y, m, d, 8, 5, tz);
  }

  formatSlot(slot: Date, university?: string | null) {
    const tz = this.resolveTimezone(university);
    return (
      slot.toLocaleString("en-US", {
        timeZone: tz,
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }) + ` (${tz} · professor-local)`
    );
  }

  async ensureDailyCounter(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    const p = zonedParts(new Date(), this.timeZone);
    const todayStr = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    if (user.lastSendResetDate !== todayStr) {
      return prisma.user.update({
        where: { id: userId },
        data: { dailySentCount: 0, lastSendResetDate: todayStr },
      });
    }
    return user;
  }

  async processNextQueueItem(
    userId?: string,
    opts?: { force?: boolean; itemId?: string }
  ) {
    const force = !!opts?.force;
    if (this.isProcessing) return { skipped: true, reason: "busy" };
    this.isProcessing = true;

    try {
      const now = new Date();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let item: any = null;

      if (opts?.itemId) {
        item = await prisma.scheduledEmail.findFirst({
          where: {
            id: opts.itemId,
            status: "scheduled",
            ...(userId ? { userId } : {}),
          },
          include: { professor: true },
        });
      } else {
        const where: {
          status: string;
          scheduledIso: { lte: Date };
          userId?: string;
        } = {
          status: "scheduled",
          scheduledIso: { lte: now },
        };
        if (userId) where.userId = userId;

        const candidates = await prisma.scheduledEmail.findMany({
          where,
          orderBy: { scheduledIso: "asc" },
          take: 40,
          include: { professor: true },
        });

        // Prefer emails whose professor-local window (or same-morning grace) is open
        item =
          candidates.find((c) =>
            this.canDispatchNow(
              now,
              c.university || c.professor?.university || null
            )
          ) || null;

        if (!item && force) {
          item = candidates[0] || null;
        } else if (!item && candidates[0]) {
          // Out of window — roll the oldest overdue without attempting send
          const roll = candidates[0];
          const university =
            roll.university || roll.professor?.university || null;
          const nextSlot = this.getNextAcademicWindowSlot(now, university);
          await prisma.scheduledEmail.update({
            where: { id: roll.id },
            data: {
              status: "scheduled",
              scheduledIso: nextSlot,
              scheduledTime: this.formatSlot(nextSlot, university),
              lastError: `Missed ${this.resolveTimezone(university)} window — rolled to next Tue–Thu 8 AM`,
            },
          });
          return {
            skipped: true,
            reason: "missed_window",
            nextSlot,
            rolledId: roll.id,
          };
        }
      }

      if (!item) {
        return { skipped: true, reason: "empty_queue" };
      }

      // Atomic claim — prevents duplicate sends under concurrent cron/dispatch
      const claimed = await prisma.scheduledEmail.updateMany({
        where: { id: item.id, status: "scheduled" },
        data: { status: "sending", lastError: null },
      });
      if (claimed.count === 0) {
        return { skipped: true, reason: "already_claimed" };
      }

      const user = await this.ensureDailyCounter(item.userId);
      if (!user) {
        await prisma.scheduledEmail.update({
          where: { id: item.id },
          data: { status: "scheduled", lastError: "no_user" },
        });
        return { skipped: true, reason: "no_user" };
      }

      const { isEmailSuppressed } = await import("./email_suppression");
      if (await isEmailSuppressed(item.userId, item.toEmail)) {
        await prisma.scheduledEmail.update({
          where: { id: item.id },
          data: {
            status: "cancelled",
            lastError: "Recipient is on suppression list",
          },
        });
        return { skipped: true, reason: "suppressed" };
      }
      if (!isSyntacticallyValidRecipient(item.toEmail)) {
        await prisma.scheduledEmail.update({
          where: { id: item.id },
          data: {
            status: "cancelled",
            lastError: "Recipient email is syntactically invalid",
          },
        });
        return { skipped: true, reason: "invalid_recipient_syntax" };
      }

      if (strictDeliverabilityEnabled() && item.kind === "outreach") {
        const prof = item.professor;
        const to = normalizeEmail(item.toEmail);
        const profEmail = normalizeEmail(prof?.email || "");
        if (!prof || !prof.emailVerified || !profEmail || to !== profEmail) {
          await prisma.scheduledEmail.update({
            where: { id: item.id },
            data: {
              status: "cancelled",
              lastError:
                "Strict deliverability mode: outreach blocked (unverified/mismatched professor email)",
            },
          });
          return { skipped: true, reason: "strict_outreach_block" };
        }
        const conf = emailConfidenceTier({
          email: to,
          name: prof.name,
          university: prof.university,
          homepageUrl: prof.homepageUrl,
        });
        if (conf.tier === "low") {
          await prisma.scheduledEmail.update({
            where: { id: item.id },
            data: {
              status: "cancelled",
              lastError: `Low email confidence (${conf.score})`,
            },
          });
          return { skipped: true, reason: "low_email_confidence" };
        }
      }

      if (item.kind === "follow_up") {
        const to = item.toEmail.toLowerCase();
        const platformOutreach = await prisma.scheduledEmail.findFirst({
          where: {
            userId: item.userId,
            status: "sent",
            kind: "outreach",
            toEmail: to,
          },
          select: { id: true },
        });
        if (
          !platformOutreach ||
          !isFollowUpEligibleAddress(to) ||
          isLegacyContactedSubject(item.subject)
        ) {
          await prisma.scheduledEmail.update({
            where: { id: item.id },
            data: {
              status: "cancelled",
              lastError:
                "Cancelled — follow-up only allowed for professors this platform actually emailed",
            },
          });
          return { skipped: true, reason: "not_platform_outreach" };
        }
      }

      const university =
        item.university || item.professor?.university || null;
      const profTz = this.resolveTimezone(university);

      // Missed professor-local window (+ grace) → roll to next Tue–Thu ~8 AM
      if (!force && !this.canDispatchNow(now, university)) {
        const nextSlot = this.getNextAcademicWindowSlot(now, university);
        await prisma.scheduledEmail.update({
          where: { id: item.id },
          data: {
            status: "scheduled",
            scheduledIso: nextSlot,
            scheduledTime: this.formatSlot(nextSlot, university),
            lastError: `Missed ${profTz} window — rolled to next Tue–Thu 8 AM`,
          },
        });
        console.log(
          `[DripDispatcher] Rolled missed window → ${item.toEmail} @ ${nextSlot.toISOString()} (${profTz})`
        );
        return { skipped: true, reason: "missed_window", nextSlot };
      }

      if (user.dailySentCount >= this.dailyCap) {
        const nextSlot = this.getNextAcademicWindowSlot(now, university);
        await prisma.scheduledEmail.update({
          where: { id: item.id },
          data: {
            status: "scheduled",
            scheduledIso: nextSlot,
            scheduledTime: this.formatSlot(nextSlot, university),
            lastError: `Daily cap ${this.dailyCap} reached — rolled to next window`,
          },
        });
        return { skipped: true, reason: "daily_cap", nextSlot };
      }

      console.log(
        `[DripDispatcher] Dispatching → ${item.professorName || item.toEmail} (${university || ""} · ${profTz})`
      );

      let sentSuccess = false;
      let sendError: string | null = null;
      let gmailMessageId: string | undefined;
      let gmailThreadId: string | undefined;

      try {
        this.isLiveSend();
        if (this.dryRun) {
          console.log(`[DripDispatcher] DRY RUN — would send to ${item.toEmail}`);
          sentSuccess = true;
          gmailMessageId = `dryrun_${Date.now()}`;
        } else if (await isMailReady(item.userId)) {
          let threadId: string | undefined = item.replyToThreadId || undefined;
          let inReplyTo: string | undefined;
          let references: string | undefined;

          if (item.kind === "follow_up") {
            const parent = item.sentHistoryId
              ? await prisma.sentHistory.findUnique({
                  where: { id: item.sentHistoryId },
                  select: { gmailMessageId: true, gmailThreadId: true },
                })
              : await prisma.sentHistory.findFirst({
                  where: {
                    userId: item.userId,
                    toEmail: item.toEmail.toLowerCase(),
                    kind: "outreach",
                  },
                  orderBy: { sentAt: "desc" },
                  select: { gmailMessageId: true, gmailThreadId: true },
                });

            const gmailApiId =
              item.replyToMessageId || parent?.gmailMessageId || null;
            threadId =
              item.replyToThreadId || parent?.gmailThreadId || undefined;

            if (gmailApiId && !gmailApiId.startsWith("dryrun_")) {
              const { getGmailRfcMessageId } = await import(
                "@/services/gmail_oauth_service"
              );
              const rfc = await getGmailRfcMessageId(item.userId, gmailApiId);
              if (rfc.rfcMessageId) {
                inReplyTo = rfc.rfcMessageId;
                references = rfc.rfcMessageId;
              }
              if (rfc.threadId) threadId = rfc.threadId;
            }
          }

          const res = await sendMailForUser(item.userId, {
            to: item.toEmail,
            cc: item.ccEmails || undefined,
            subject: item.subject,
            body: item.body,
            htmlBody: item.htmlBody || undefined,
            professorFocus: item.professor?.researchFocus || null,
            professorUniversity:
              item.university || item.professor?.university || null,
            threadId,
            inReplyTo,
            references,
            skipCvAttachment: item.kind === "follow_up",
          });
          sentSuccess = true;
          gmailMessageId = (res as { id?: string }).id || undefined;
          gmailThreadId =
            (res as { threadId?: string }).threadId || threadId || undefined;
        } else {
          sendError = "No inbox connected. Connect Gmail in Connect Inbox.";
        }
      } catch (err) {
        sendError = err instanceof Error ? err.message : String(err);
      }

      if (sentSuccess) {
        await prisma.scheduledEmail.update({
          where: { id: item.id },
          data: { status: "sent", sentAt: new Date(), lastError: null },
        });
        await prisma.sentHistory.create({
          data: {
            userId: item.userId,
            toEmail: item.toEmail.toLowerCase(),
            professorName: item.professorName,
            university: item.university,
            subject: item.subject,
            body: item.body,
            ccEmails: item.ccEmails,
            professorId: item.professorId,
            kind: item.kind === "follow_up" ? "follow_up" : "outreach",
            variant: item.variant || null,
            gmailMessageId,
            gmailThreadId,
          },
        });
        if (item.kind === "follow_up" && item.sentHistoryId) {
          await prisma.sentHistory.update({
            where: { id: item.sentHistoryId },
            data: {
              followUpCount: { increment: 1 },
              followUpQueuedAt: null,
            },
          });
        }
        await prisma.user.update({
          where: { id: item.userId },
          data: { dailySentCount: { increment: 1 } },
        });
        console.log(`[DripDispatcher] SUCCESS → ${item.toEmail}`);
      } else {
        const permanentAddressFailure = isPermanentAddressFailure(sendError);
        const authBroken =
          /invalid_grant|Gmail authorization expired|Reconnect Gmail/i.test(
            sendError || ""
          );
        if (permanentAddressFailure) {
          const { suppressEmail } = await import("./email_suppression");
          await suppressEmail({
            userId: item.userId,
            email: item.toEmail,
            reason: sendError || "Permanent address failure",
            source: "bounce",
          });
          await prisma.scheduledEmail.update({
            where: { id: item.id },
            data: {
              status: "cancelled",
              lastError:
                sendError ||
                "Cancelled after permanent address failure; recipient suppressed",
            },
          });
          console.warn(
            `[DripDispatcher] Cancelled invalid recipient ${item.toEmail}: ${sendError}`
          );
          return {
            skipped: true,
            reason: "invalid_recipient",
            error: sendError,
            id: item.id,
          };
        }
        if (authBroken) {
          // Do NOT burn the week rolling — hold until user reconnects Gmail
          await prisma.scheduledEmail.update({
            where: { id: item.id },
            data: {
              status: "scheduled",
              lastError:
                sendError ||
                "Gmail authorization expired — reconnect in Connect Inbox",
            },
          });
          console.warn(
            `[DripDispatcher] Gmail auth broken for ${item.userId} — holding queue`
          );
          return {
            skipped: true,
            reason: "gmail_auth_broken",
            error: sendError,
            id: item.id,
          };
        }

        const nextSlot = this.getNextAcademicWindowSlot(
          now,
          item.university || item.professor?.university
        );
        await prisma.scheduledEmail.update({
          where: { id: item.id },
          data: {
            status: "scheduled",
            scheduledIso: nextSlot,
            scheduledTime: this.formatSlot(
              nextSlot,
              item.university || item.professor?.university
            ),
            lastError: sendError,
          },
        });
        console.warn(
          `[DripDispatcher] Rolled over ${item.toEmail}: ${sendError}`
        );
      }

      const jitterMs =
        Math.floor(Math.random() * (this.maxDelayMs - this.minDelayMs)) +
        this.minDelayMs;

      return {
        sent: sentSuccess,
        to: item.toEmail,
        dryRun: this.dryRun,
        error: sendError,
        cooldownMs: jitterMs,
        id: item.id,
      };
    } finally {
      this.isProcessing = false;
    }
  }

  /** Process up to `limit` due emails (used by Vercel Cron). Keep small for Hobby ~10s. */
  async processDueBatch(limit = 8, opts?: { force?: boolean }) {
    const results = [];
    const capped = Math.min(limit, 12);
    for (let i = 0; i < capped; i++) {
      const r = await this.processNextQueueItem(undefined, opts);
      results.push(r);
      if (r && "skipped" in r) {
        if (
          r.reason === "empty_queue" ||
          r.reason === "busy" ||
          r.reason === "gmail_auth_broken"
        ) {
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    return results;
  }

  /** Dry-run simulation of window + jitter math (no DB writes required). */
  simulateWindowPhysics(sampleSize = 10) {
    const samples: Array<{
      index: number;
      delayMs: number;
      delaySec: number;
      cumulativeSec: number;
    }> = [];
    let cumulative = 0;
    for (let i = 0; i < sampleSize; i++) {
      const delayMs =
        Math.floor(Math.random() * (this.maxDelayMs - this.minDelayMs)) + this.minDelayMs;
      cumulative += delayMs / 1000;
      samples.push({
        index: i + 1,
        delayMs,
        delaySec: Math.round(delayMs / 1000),
        cumulativeSec: Math.round(cumulative),
      });
    }
    const emailsPerHour = Math.floor(3600 / ((this.minDelayMs + this.maxDelayMs) / 2 / 1000));
    return {
      window: "Tue–Thu 8:00–9:00 AM in each professor's university timezone",
      minDelayMs: this.minDelayMs,
      maxDelayMs: this.maxDelayMs,
      dailyCap: this.dailyCap,
      estimatedEmailsPerHour: emailsPerHour,
      samples,
      fitsIn60MinWindow: emailsPerHour >= 400 && emailsPerHour <= 600,
    };
  }
}

export const dripDispatcher = new EnterpriseDripDispatcher();
