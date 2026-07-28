/**
 * ScholarReach AI — Academic High-Speed Drip Dispatcher
 * Window: Tue–Thu 8:00–9:00 AM local. 5–9s jitter. Cap 500/day with rollover.
 */
import { prisma } from "@/lib/prisma";
import { sendMailForUser } from "./mail_sender";
import { isPlatformMailConfigured } from "./platform_mail";

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

export class EnterpriseDripDispatcher {
  isProcessing = false;
  minDelayMs = 5 * 1000;
  maxDelayMs = 9 * 1000;
  dailyCap = parseInt(process.env.DAILY_SEND_CAP || "500", 10);
  dryRun = process.env.DRIP_DRY_RUN === "true";
  private watcher: NodeJS.Timeout | null = null;

  startWatcher() {
    console.log(
      `[DripDispatcher] High-Speed Drip Watchdog Active (Cap: ${this.dailyCap}/day, Window: Tue-Thu 8:00-9:00 AM, dryRun=${this.dryRun})...`
    );
    this.watcher = setInterval(() => this.processNextQueueItem(), 5 * 1000);
    this.processNextQueueItem();
  }

  stopWatcher() {
    if (this.watcher) clearInterval(this.watcher);
    this.watcher = null;
  }

  isAcademicWindow(now = new Date()) {
    const day = now.getDay();
    const isTueThu = day === 2 || day === 3 || day === 4;
    if (!isTueThu) return false;
    const currentMin = now.getHours() * 60 + now.getMinutes();
    return currentMin >= 8 * 60 && currentMin <= 9 * 60;
  }

  getNextAcademicWindowSlot(fromDate = new Date()) {
    const cursor = new Date(fromDate.getTime());
    cursor.setDate(cursor.getDate() + 1);
    while (true) {
      const day = cursor.getDay();
      if (day === 2 || day === 3 || day === 4) {
        cursor.setHours(8, Math.floor(Math.random() * 20), 0, 0);
        return cursor;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  formatSlot(slot: Date) {
    const dayName = slot.toLocaleDateString("en-US", { weekday: "long" });
    const monthName = slot.toLocaleDateString("en-US", { month: "short" });
    const dayNum = slot.getDate();
    const minStr = String(slot.getMinutes()).padStart(2, "0");
    return `${dayName}, ${monthName} ${dayNum} at 8:${minStr} AM`;
  }

  async ensureDailyCounter(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    const todayStr = new Date().toDateString();
    if (user.lastSendResetDate !== todayStr) {
      return prisma.user.update({
        where: { id: userId },
        data: { dailySentCount: 0, lastSendResetDate: todayStr },
      });
    }
    return user;
  }

  async processNextQueueItem(userId?: string) {
    if (this.isProcessing) return { skipped: true, reason: "busy" };
    this.isProcessing = true;

    try {
      const now = new Date();
      const where: {
        status: string;
        scheduledIso: { lte: Date };
        userId?: string;
      } = {
        status: "scheduled",
        scheduledIso: { lte: now },
      };
      if (userId) where.userId = userId;

      const item = await prisma.scheduledEmail.findFirst({
        where,
        orderBy: { scheduledIso: "asc" },
      });

      if (!item) {
        return { skipped: true, reason: "empty_queue" };
      }

      const user = await this.ensureDailyCounter(item.userId);
      if (!user) return { skipped: true, reason: "no_user" };

      if (user.dailySentCount >= this.dailyCap) {
        const nextSlot = this.getNextAcademicWindowSlot(now);
        await prisma.scheduledEmail.update({
          where: { id: item.id },
          data: {
            scheduledIso: nextSlot,
            scheduledTime: this.formatSlot(nextSlot),
            lastError: `Daily cap ${this.dailyCap} reached — rolled to next window`,
          },
        });
        return { skipped: true, reason: "daily_cap", nextSlot };
      }

      if (!this.isAcademicWindow(now)) {
        const nextSlot = this.getNextAcademicWindowSlot(now);
        await prisma.scheduledEmail.update({
          where: { id: item.id },
          data: {
            scheduledIso: nextSlot,
            scheduledTime: this.formatSlot(nextSlot),
          },
        });
        console.log(
          `[DripDispatcher] ${item.toEmail} outside academic window → ${this.formatSlot(nextSlot)}`
        );
        return { rescheduled: true, nextSlot: this.formatSlot(nextSlot), to: item.toEmail };
      }

      console.log(
        `[DripDispatcher] Dispatching → ${item.professorName || item.toEmail} (${item.university || ""})`
      );

      let sentSuccess = false;
      let sendError: string | null = null;
      let gmailMessageId: string | undefined;

      try {
        if (this.dryRun) {
          console.log(`[DripDispatcher] DRY RUN — would send to ${item.toEmail}`);
          sentSuccess = true;
          gmailMessageId = `dryrun_${Date.now()}`;
        } else if (await isMailReady(item.userId)) {
          const res = await sendMailForUser(item.userId, {
            to: item.toEmail,
            cc: item.ccEmails || undefined,
            subject: item.subject,
            body: item.body,
            htmlBody: item.htmlBody || undefined,
          });
          sentSuccess = true;
          gmailMessageId = res.id || undefined;
        } else {
          sendError = "No send path connected (Platform Resend / Outlook / SMTP).";
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
            gmailMessageId,
          },
        });
        await prisma.user.update({
          where: { id: item.userId },
          data: { dailySentCount: { increment: 1 } },
        });
        console.log(`[DripDispatcher] SUCCESS → ${item.toEmail}`);
      } else {
        const nextSlot = this.getNextAcademicWindowSlot(now);
        await prisma.scheduledEmail.update({
          where: { id: item.id },
          data: {
            scheduledIso: nextSlot,
            scheduledTime: this.formatSlot(nextSlot),
            lastError: sendError,
          },
        });
        console.warn(`[DripDispatcher] Rolled over ${item.toEmail}: ${sendError}`);
      }

      const jitterMs =
        Math.floor(Math.random() * (this.maxDelayMs - this.minDelayMs)) + this.minDelayMs;

      return {
        sent: sentSuccess,
        to: item.toEmail,
        dryRun: this.dryRun,
        error: sendError,
        cooldownMs: jitterMs,
      };
    } finally {
      // Release after short delay to emulate drip physics in watcher mode
      setTimeout(() => {
        this.isProcessing = false;
      }, 100);
    }
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
      window: "Tue–Thu 8:00–9:00 AM local",
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
