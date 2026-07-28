import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mineFreshLeads } from "@/services/faculty_miner";
import { withAuthUser } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  return withAuthUser(async (user) => {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.toLowerCase() || "";
    const university = searchParams.get("university") || "";
    const focus = searchParams.get("focus") || "";

    const professors = await prisma.professor.findMany({
      where: {
        userId: user.id,
        ...(university ? { university: { contains: university } } : {}),
        ...(focus ? { researchFocus: { contains: focus } } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { university: { contains: q } },
                { researchFocus: { contains: q } },
                { email: { contains: q } },
              ],
            }
          : {}),
      },
      include: {
        drafts: { where: { status: "pending" }, take: 1 },
      },
      orderBy: [{ matchScore: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ professors, count: professors.length });
  });
}

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json().catch(() => ({}));
    // Free-tier guard: keep mining modest so operator API bills stay small
    const count = Math.min(Number(body.count) || 10, 20);

    if (!process.env.EXA_API_KEY && !process.env.TAVILY_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Mining APIs not configured on this free Hobby deploy. Import leads or set optional operator keys.",
        },
        { status: 400 }
      );
    }

    const result = await mineFreshLeads(user.id, count);
    return NextResponse.json(result);
  });
}
