import { NextRequest, NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import { getProfileBundle, updateProfile } from "@/services/profile_service";
import { OUTREACH_REGIONS } from "@/lib/regions";

export async function GET() {
  return withAuthUser(async (user) => {
    const bundle = await getProfileBundle(user.id);
    return NextResponse.json({
      ...bundle,
      regions: OUTREACH_REGIONS,
    });
  });
}

export async function PATCH(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json();
    const profile = await updateProfile(user.id, body);
    const bundle = await getProfileBundle(user.id);
    return NextResponse.json({ ok: true, profile, bundle });
  });
}

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json();
    if (body.action === "complete") {
      await updateProfile(user.id, {
        onboardingStep: "done",
        onboardingComplete: true,
        interviewComplete: true,
        ...body.profile,
      });
      const bundle = await getProfileBundle(user.id);
      return NextResponse.json({ ok: true, bundle });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  });
}
