import { scoreEmailCandidate } from "@/services/faculty_email_verifier";
import type { OpenAlexFaculty } from "@/services/openalex_client";
import { scoreProfessorMatch } from "@/services/match_scorer";

type RankInput = {
  candidate: OpenAlexFaculty;
  university: string;
  topic: string;
  profile: {
    researchInterests?: string | null;
    workModePref?: string | null;
    location?: string | null;
  } | null;
  skillsText: string;
  existingEmail?: string | null;
};

export type RankedAuthor = {
  candidate: OpenAlexFaculty;
  total: number;
  reasons: string[];
  parts: {
    topical: number;
    activity: number;
    roleFit: number;
    institution: number;
    emailConfidence: number;
  };
};

function topicalScore(topic: string, c: OpenAlexFaculty) {
  const t = topic.toLowerCase();
  const blob = `${c.researchFocus || ""} ${(c.tags || []).join(" ")} ${c.recentPaper || ""}`.toLowerCase();
  let s = 0;
  if (blob.includes(t)) s += 35;
  const toks = t.split(/\s+/).filter((x) => x.length > 3);
  for (const tk of toks) if (blob.includes(tk)) s += 6;
  return Math.min(45, s);
}

function activityScore(worksCount: number) {
  if (worksCount >= 200) return 20;
  if (worksCount >= 120) return 17;
  if (worksCount >= 70) return 13;
  if (worksCount >= 25) return 9;
  return 4;
}

function roleFitScore(c: OpenAlexFaculty) {
  const wc = c.worksCount || 0;
  if (wc >= 50) return 12;
  if (wc >= 20) return 8;
  return 3;
}

function institutionScore(university: string, c: OpenAlexFaculty) {
  const u = university.toLowerCase();
  const cu = (c.university || "").toLowerCase();
  if (cu === u) return 10;
  if (cu.includes(u.split(" ")[0] || "")) return 7;
  return 2;
}

function emailConfidenceScore(name: string, university: string, email?: string | null) {
  if (!email) return 2;
  const scored = scoreEmailCandidate({ email, name, university });
  if (scored.score >= 70) return 13;
  if (scored.score >= 45) return 8;
  return 3;
}

export function rankAuthorCandidate(input: RankInput): RankedAuthor {
  const fit = scoreProfessorMatch({
    researchInterests: input.profile?.researchInterests,
    skillsText: input.skillsText,
    workModePref: input.profile?.workModePref,
    location: input.profile?.location,
    professor: {
      researchFocus: input.candidate.researchFocus,
      recentPaper: input.candidate.recentPaper,
      labName: null,
      tags: input.candidate.tags,
      locationMode: "Remote",
      university: input.university,
    },
  });

  const parts = {
    topical: topicalScore(input.topic, input.candidate),
    activity: activityScore(input.candidate.worksCount || 0),
    roleFit: roleFitScore(input.candidate),
    institution: institutionScore(input.university, input.candidate),
    emailConfidence: emailConfidenceScore(
      input.candidate.name,
      input.university,
      input.existingEmail
    ),
  };
  const total =
    parts.topical +
    parts.activity +
    parts.roleFit +
    parts.institution +
    parts.emailConfidence +
    Math.round((fit.score / 100) * 12);

  const reasons = [
    `topic=${parts.topical}`,
    `activity=${parts.activity}`,
    `role=${parts.roleFit}`,
    `institution=${parts.institution}`,
    `email=${parts.emailConfidence}`,
    `fit=${fit.score}`,
  ];
  return { candidate: input.candidate, total: Math.min(100, total), reasons, parts };
}

