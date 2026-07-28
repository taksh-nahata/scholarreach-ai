import { NextRequest, NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import {
  answerInterview,
  startOrContinueInterview,
} from "@/services/onboarding_chat";

export async function GET() {
  return withAuthUser(async (user) => {
    const data = await startOrContinueInterview(user.id);
    return NextResponse.json(data);
  });
}

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json();
    const answer = String(body.answer || "");
    const data = await answerInterview(user.id, answer);
    return NextResponse.json(data);
  });
}
