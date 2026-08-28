import { NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import { getOutreachAnalytics } from "@/services/outreach_analytics";
import { refreshOutreachLearnings } from "@/services/outreach_learning";

export async function GET() {
  return withAuthUser(async (user) => {
    const data = await getOutreachAnalytics(user.id);
    return NextResponse.json(data);
  });
}

export async function POST() {
  return withAuthUser(async (user) => {
    await refreshOutreachLearnings(user.id);
    const data = await getOutreachAnalytics(user.id);
    return NextResponse.json({ ok: true, ...data });
  });
}
