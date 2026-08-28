import { NextRequest, NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import {
  assessOutreachHealth,
  selfHealOutreach,
} from "@/services/outreach_health";

export async function GET() {
  return withAuthUser(async (user) => {
    const health = await assessOutreachHealth(user.id);
    return NextResponse.json(health);
  });
}

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json().catch(() => ({}));
    const force = !!body.force;
    const result = await selfHealOutreach({
      userId: user.id,
      force,
      limit: 15,
    });
    return NextResponse.json(result);
  });
}
