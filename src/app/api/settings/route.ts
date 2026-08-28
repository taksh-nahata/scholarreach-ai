import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuthUser } from "@/lib/api-auth";
import { ensureProfile, getProfileBundle } from "@/services/profile_service";
import { prisma } from "@/lib/prisma";
import { getApiUsage } from "@/services/api_budget";
import { countHumanApprovals } from "@/services/approval_service";
import { scheduleFollowUpsForUser } from "@/services/follow_up_scheduler";
import { strictDeliverabilityEnabled } from "@/services/deliverability_guard";

const schema = z.object({
  autoApproveMode: z.enum(["manual", "agent_gate", "auto"]).optional(),
  autoApproveMinApprovals: z.number().int().min(1).max(50).optional(),
  followUpEnabled: z.boolean().optional(),
  followUpAfterDays: z.number().int().min(3).max(21).optional(),
  followUpMaxCount: z.number().int().min(1).max(2).optional(),
  autopilotEnabled: z.boolean().optional(),
  autopilotMineWhenBelow: z.number().int().min(1).max(40).optional(),
  autopilotMineCount: z.number().int().min(5).max(35).optional(),
  autopilotMinFit: z.number().int().min(30).max(90).optional(),
  autopilotMaxDraftsPerRun: z.number().int().min(1).max(35).optional(),
});

export async function GET() {
  return withAuthUser(async (user) => {
    await ensureProfile(user.id);
    const bundle = await getProfileBundle(user.id);
    const usage = await getApiUsage(user.id);
    const humanApprovals = await countHumanApprovals(user.id);
    const p = bundle?.profile as
      | {
          autoApproveMode?: string;
          autoApproveMinApprovals?: number;
          followUpEnabled?: boolean;
          followUpAfterDays?: number;
          followUpMaxCount?: number;
          autopilotEnabled?: boolean;
          autopilotMineWhenBelow?: number;
          autopilotMineCount?: number;
          autopilotMinFit?: number;
          autopilotMaxDraftsPerRun?: number;
          autopilotLastRunAt?: Date | null;
        }
      | null
      | undefined;

    const pendingFollowUps = await prisma.scheduledEmail.count({
      where: { userId: user.id, status: "scheduled", kind: "follow_up" },
    });

    return NextResponse.json({
      settings: {
        autoApproveMode: p?.autoApproveMode || "agent_gate",
        autoApproveMinApprovals: p?.autoApproveMinApprovals ?? 5,
        followUpEnabled: p?.followUpEnabled !== false,
        followUpAfterDays: p?.followUpAfterDays ?? 7,
        followUpMaxCount: p?.followUpMaxCount ?? 1,
        strictDeliverabilityMode: strictDeliverabilityEnabled(),
        autopilotEnabled: p?.autopilotEnabled !== false,
        autopilotMineWhenBelow: p?.autopilotMineWhenBelow ?? 25,
        autopilotMineCount: p?.autopilotMineCount ?? 30,
        autopilotMinFit: p?.autopilotMinFit ?? 50,
        autopilotMaxDraftsPerRun: p?.autopilotMaxDraftsPerRun ?? 30,
        autopilotLastRunAt: p?.autopilotLastRunAt?.toISOString() || null,
      },
      humanApprovals,
      pendingFollowUps,
      usage,
    });
  });
}

export async function PATCH(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
    }
    await ensureProfile(user.id);
    const enablingAutopilot = parsed.data.autopilotEnabled === true;
    const profile = await prisma.studentProfile.update({
      where: { userId: user.id },
      data: {
        autoApproveMode:
          enablingAutopilot && parsed.data.autoApproveMode === undefined
            ? "agent_gate"
            : parsed.data.autoApproveMode,
        autoApproveMinApprovals: parsed.data.autoApproveMinApprovals,
        followUpEnabled: parsed.data.followUpEnabled,
        followUpAfterDays: parsed.data.followUpAfterDays,
        followUpMaxCount: parsed.data.followUpMaxCount,
        autopilotEnabled: parsed.data.autopilotEnabled,
        autopilotMineWhenBelow: parsed.data.autopilotMineWhenBelow,
        autopilotMineCount: parsed.data.autopilotMineCount,
        autopilotMinFit: parsed.data.autopilotMinFit,
        autopilotMaxDraftsPerRun: parsed.data.autopilotMaxDraftsPerRun,
      },
    });
    return NextResponse.json({
      ok: true,
      settings: {
        autoApproveMode: profile.autoApproveMode,
        autoApproveMinApprovals: profile.autoApproveMinApprovals,
        followUpEnabled: profile.followUpEnabled,
        followUpAfterDays: profile.followUpAfterDays,
        followUpMaxCount: profile.followUpMaxCount,
        autopilotEnabled: profile.autopilotEnabled,
        autopilotMineWhenBelow: profile.autopilotMineWhenBelow,
        autopilotMineCount: profile.autopilotMineCount,
        autopilotMinFit: profile.autopilotMinFit,
        autopilotMaxDraftsPerRun: profile.autopilotMaxDraftsPerRun,
      },
    });
  });
}

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json().catch(() => ({}));
    if (body.action === "queue_followups_now") {
      const result = await scheduleFollowUpsForUser(user.id);
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "run_autopilot_now") {
      const { runAutopilotForUser } = await import(
        "@/services/outreach_autopilot"
      );
      const result = await runAutopilotForUser(user.id, { force: true });
      return NextResponse.json({ ok: true, result });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  });
}
