import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { mineFreshLeads } from "@/services/faculty_miner";

export async function GET(req: NextRequest) {
  const user = await requireUser();
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
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ professors, count: professors.length });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const body = await req.json().catch(() => ({}));
  const count = Math.min(Number(body.count) || 20, 50);

  if (!process.env.EXA_API_KEY && !process.env.TAVILY_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Mining APIs not configured. Set EXA_API_KEY / TAVILY_API_KEY / FIRECRAWL_API_KEY / PROVOCATIVE_API_KEY in .env",
      },
      { status: 400 }
    );
  }

  const result = await mineFreshLeads(user.id, count);
  return NextResponse.json(result);
}
