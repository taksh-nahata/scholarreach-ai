import { getProfileBundle } from "@/services/profile_service";
import { importFacultyLead } from "@/services/faculty_miner";
import { skillsToText } from "@/services/match_scorer";

export type ImportCandidate = {
  name: string;
  university: string;
  researchFocus?: string | null;
  recentPaper?: string | null;
  tags?: string[];
  homepageUrl?: string | null;
  worksCount?: number | null;
  fitNote?: string | null;
  rank?: number | null;
};

export async function importProfessorCandidates(opts: {
  userId: string;
  candidates: ImportCandidate[];
  /** Slightly lower bar for user-selected ranked suggestions */
  minScore?: number;
}) {
  const bundle = await getProfileBundle(opts.userId);
  const profile = bundle?.profile;
  const skillsText = skillsToText((profile?.skills || {}) as unknown);
  const profileLite = profile
    ? {
        researchInterests: profile.researchInterests,
        workModePref: profile.workModePref,
        location: profile.location,
      }
    : null;

  const baseMin = Number(process.env.MIN_MATCH_SCORE || 40);
  const minScore =
    opts.minScore ??
    Math.max(30, baseMin - 8);

  const imported: Array<{
    id: string;
    name: string;
    university: string;
    email: string | null;
    emailVerified: boolean;
    matchScore: number;
  }> = [];
  const skipped: Array<{ name: string; university: string; reason: string }> =
    [];

  for (const c of opts.candidates.slice(0, 12)) {
    const fitNote =
      c.fitNote ||
      (c.rank != null
        ? `Similar-author import · rank=${c.rank}`
        : "Similar-author import");

    const result = await importFacultyLead({
      userId: opts.userId,
      name: c.name,
      university: c.university,
      researchFocus: c.researchFocus,
      recentPaper: c.recentPaper,
      tags: c.tags || [],
      hintUrl: c.homepageUrl,
      worksCount: c.worksCount,
      skillsText,
      profile: profileLite,
      minScore,
      fitNote,
    });

    if (result.skipped) {
      skipped.push({
        name: c.name,
        university: c.university,
        reason: result.reason,
      });
      continue;
    }

    imported.push({
      id: result.id,
      name: result.name,
      university: result.university,
      email: result.email,
      emailVerified: result.emailVerified,
      matchScore: result.matchScore,
    });
  }

  return { imported, skipped, minScore };
}
