import { NextRequest, NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import {
  generateDraftsForProfessors,
  generatePersonalizedDraft,
} from "@/services/email_personalizer";

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json();
    if (body.professorId) {
      const draft = await generatePersonalizedDraft({
        userId: user.id,
        professorId: String(body.professorId),
      });
      return NextResponse.json({ draft });
    }
    if (Array.isArray(body.professorIds)) {
      const drafts = await generateDraftsForProfessors(
        user.id,
        body.professorIds.map(String)
      );
      return NextResponse.json({ drafts, count: drafts.length });
    }
    return NextResponse.json(
      { error: "Provide professorId or professorIds" },
      { status: 400 }
    );
  });
}
