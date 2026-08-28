import { NextRequest, NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import {
  generateDraftsForProfessors,
  generatePersonalizedDraft,
} from "@/services/email_personalizer";

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    try {
      const body = await req.json();
      if (body.professorId) {
        const result = await generatePersonalizedDraft({
          userId: user.id,
          professorId: String(body.professorId),
        });
        return NextResponse.json(result);
      }
      if (Array.isArray(body.professorIds)) {
        const { drafts, skipped } = await generateDraftsForProfessors(
          user.id,
          body.professorIds.map(String)
        );
        return NextResponse.json({
          drafts,
          skipped,
          count: drafts.length,
        });
      }
      return NextResponse.json(
        { error: "Provide professorId or professorIds" },
        { status: 400 }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Draft failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
