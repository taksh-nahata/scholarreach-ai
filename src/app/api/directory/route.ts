import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuthUser } from "@/lib/api-auth";
import { PENDING_APPROVAL_STATUSES } from "@/lib/draft_status";
import { emailConfidenceTier } from "@/services/email_confidence";

export async function GET(req: NextRequest) {
  return withAuthUser(async (user) => {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.toLowerCase() || "";
    const university = searchParams.get("university") || "";
    const focus = searchParams.get("focus") || "";

    const professors = await prisma.professor.findMany({
      where: {
        userId: user.id,
        ...(university ? { university: { contains: university, mode: "insensitive" } } : {}),
        ...(focus ? { researchFocus: { contains: focus, mode: "insensitive" } } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { university: { contains: q, mode: "insensitive" } },
                { researchFocus: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        drafts: {
          where: { status: { in: [...PENDING_APPROVAL_STATUSES] } },
          take: 1,
        },
      },
      orderBy: [{ matchScore: "desc" }, { createdAt: "desc" }],
    });

    const sentRows = await prisma.sentHistory.findMany({
      where: {
        userId: user.id,
        professorId: { in: professors.map((p) => p.id) },
      },
      select: { professorId: true },
      distinct: ["professorId"],
    });
    const contactedIds = new Set(
      sentRows.map((r) => r.professorId).filter(Boolean) as string[]
    );

    return NextResponse.json({
      professors: professors.map((p) => ({
        ...p,
        contacted: contactedIds.has(p.id),
        emailConfidence: emailConfidenceTier({
          email: p.email,
          name: p.name,
          university: p.university,
          homepageUrl: p.homepageUrl,
        }),
      })),
      count: professors.length,
    });
  });
}

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json().catch(() => ({}));
    const count = Math.min(Number(body.count) || 20, 20);
    // Prefer background job so leaving the tab does not abort mining
    const { startMineLeadsJob, tickMineLeadsJob } = await import(
      "@/services/background_jobs"
    );
    const job = await startMineLeadsJob(user.id, count);
    const ticked = (await tickMineLeadsJob(user.id, 2)) || job;
    return NextResponse.json({
      ok: true,
      background: true,
      mined: ticked.verified,
      job: ticked,
    });
  });
}
