import { NextRequest, NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { discoverFacultyAtUniversity } from "@/services/openalex_client";
import { getProfileBundle } from "@/services/profile_service";
import { skillsToText } from "@/services/match_scorer";
import { rankAuthorCandidate } from "@/services/author_ranking";
import { emailConfidenceTier } from "@/services/email_confidence";
import { normalizeDedupeKey } from "@/lib/utils";

export async function POST(req: NextRequest) {
  return withAuthUser(async (user) => {
    const body = await req.json().catch(() => ({}));
    const professorId = body.professorId ? String(body.professorId) : null;
    const source = professorId
      ? await prisma.professor.findFirst({
          where: { id: professorId, userId: user.id },
        })
      : null;

    const university = String(body.university || source?.university || "").trim();
    const topic = String(
      body.topic || source?.researchFocus || source?.recentPaper || ""
    ).trim();
    const limit = Math.min(Math.max(Number(body.limit) || 8, 1), 15);
    if (!university || !topic) {
      return NextResponse.json(
        { error: "Provide professorId, or university + topic." },
        { status: 400 }
      );
    }

    const bundle = await getProfileBundle(user.id);
    const skillsText = skillsToText((bundle?.profile?.skills || {}) as unknown);
    const profileLite = bundle?.profile
      ? {
          researchInterests: bundle.profile.researchInterests,
          workModePref: bundle.profile.workModePref,
          location: bundle.profile.location,
        }
      : null;

    const existing = await prisma.professor.findMany({
      where: { userId: user.id, university: { contains: university, mode: "insensitive" } },
      select: { name: true, university: true },
    });
    const dedupe = new Set(existing.map((e) => normalizeDedupeKey(e.name, e.university)));

    const discovered = await discoverFacultyAtUniversity({
      university,
      topic,
      limit: Math.min(30, limit * 3),
    });
    const ranked = discovered
      .filter((c) => !dedupe.has(normalizeDedupeKey(c.name, university)))
      .map((candidate) => {
        const rank = rankAuthorCandidate({
          candidate,
          university,
          topic,
          profile: profileLite,
          skillsText,
          existingEmail: null,
        });
        return {
          openAlexId: candidate.openAlexId,
          name: candidate.name,
          university,
          researchFocus: candidate.researchFocus,
          recentPaper: candidate.recentPaper,
          tags: candidate.tags,
          worksCount: candidate.worksCount,
          homepageUrl: candidate.homepageUrl,
          rank: rank.total,
          rankReasons: rank.reasons,
          emailConfidence: emailConfidenceTier({
            email: null,
            name: candidate.name,
            university,
            homepageUrl: candidate.homepageUrl,
          }),
        };
      })
      .sort((a, b) => b.rank - a.rank)
      .slice(0, limit);

    return NextResponse.json({
      sourceProfessorId: professorId,
      university,
      topic,
      suggestions: ranked,
      count: ranked.length,
    });
  });
}

