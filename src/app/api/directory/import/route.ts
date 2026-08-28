import { NextRequest, NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import {
  importProfessorCandidates,
  type ImportCandidate,
} from "@/services/professor_import";

export const maxDuration = 60;

function parseCandidates(body: unknown): ImportCandidate[] {
  if (!body || typeof body !== "object") return [];
  const raw = (body as { candidates?: unknown }).candidates;
  if (!Array.isArray(raw)) return [];
  const out: ImportCandidate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const name = String(c.name || "").trim();
    const university = String(c.university || "").trim();
    if (!name || !university) continue;
    out.push({
      name,
      university,
      researchFocus: c.researchFocus ? String(c.researchFocus) : null,
      recentPaper: c.recentPaper ? String(c.recentPaper) : null,
      tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
      homepageUrl: c.homepageUrl ? String(c.homepageUrl) : null,
      worksCount:
        c.worksCount != null ? Number(c.worksCount) || null : null,
      fitNote: c.fitNote ? String(c.fitNote) : null,
      rank: c.rank != null ? Number(c.rank) || null : null,
    });
  }
  return out;
}

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json().catch(() => ({}));
    const candidates = parseCandidates(body);
    if (!candidates.length) {
      return NextResponse.json(
        { error: "Provide candidates: [{ name, university, ... }]" },
        { status: 400 }
      );
    }

    const result = await importProfessorCandidates({
      userId: user.id,
      candidates,
    });

    const verifiedIds = result.imported
      .filter((p) => p.emailVerified && p.email)
      .map((p) => p.id);

    return NextResponse.json({
      ...result,
      verifiedIds,
      count: result.imported.length,
    });
  });
}
