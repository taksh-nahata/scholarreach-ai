import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuthUser } from "@/lib/api-auth";
import { ensureProfile, getProfileBundle } from "@/services/profile_service";
import { prisma } from "@/lib/prisma";
import { getApiUsage } from "@/services/api_budget";
import { countHumanApprovals } from "@/services/approval_service";

const schema = z.object({
  autoApproveMode: z.enum(["manual", "agent_gate", "auto"]).optional(),
  autoApproveMinApprovals: z.number().int().min(1).max(50).optional(),
});

export async function GET() {
  return withAuthUser(async (user) => {
    await ensureProfile(user.id);
    const bundle = await getProfileBundle(user.id);
    const usage = await getApiUsage(user.id);
    const humanApprovals = await countHumanApprovals(user.id);
    return NextResponse.json({
      settings: {
        autoApproveMode: bundle?.profile?.autoApproveMode || "manual",
        autoApproveMinApprovals:
          bundle?.profile?.autoApproveMinApprovals ?? 5,
      },
      humanApprovals,
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
    const profile = await prisma.studentProfile.update({
      where: { userId: user.id },
      data: {
        autoApproveMode: parsed.data.autoApproveMode,
        autoApproveMinApprovals: parsed.data.autoApproveMinApprovals,
      },
    });
    return NextResponse.json({
      ok: true,
      settings: {
        autoApproveMode: profile.autoApproveMode,
        autoApproveMinApprovals: profile.autoApproveMinApprovals,
      },
    });
  });
}
