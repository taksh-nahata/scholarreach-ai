/**
 * Profile-aware faculty discovery — FREE-first (OpenAlex), paid APIs last resort.
 * Emails resolved via directory → personal/lab (never invent).
 */
import { prisma } from "@/lib/prisma";
import { normalizeDedupeKey, toJsonArray } from "@/lib/utils";
import { mapPool } from "@/lib/async_pool";
import { universitiesForRegions, topicsFromProfile } from "@/lib/university_pools";
import { getProfileBundle } from "@/services/profile_service";
import { scoreProfessorMatch, skillsToText } from "@/services/match_scorer";
import { rankAuthorCandidate } from "@/services/author_ranking";
import { tryConsumeApi } from "@/services/api_budget";
import { resolveFacultyEmail } from "./faculty_email_resolver";
import {
  discoverFacultyAtUniversity,
  type OpenAlexFaculty,
} from "./openalex_client";
import {
  findRecentPaperRedundant,
  loadPageTextRedundant,
  searchTopicPagesRedundant,
} from "./faculty_search";
import {
  classifyFacultyTitle,
  inferTitleFromSignals,
  isOutreachTargetRole,
  normalizeTitleForStorage,
} from "./faculty_role";

async function extractFacultyData(
  pageText: string,
  university: string,
  topicHint: string,
  userId: string
) {
  if (!(await tryConsumeApi(userId, "llm", 1))) return null;
  const { completePrompt } = await import("@/services/llm_client");

  const prompt = `Extract ONE faculty member matching: ${topicHint}
Return ONLY JSON. Do NOT invent email (leave ""). Prefer single-faculty pages.
Reject students/postdocs/rosters → {"valid":false}.
title one of: Professor|Associate Professor|Assistant Professor|Principal Investigator|Research Scientist|Lecturer

{"valid":true,"name":"Dr. Full Name","title":"Associate Professor","email":"","ccEmails":[],"specialInstructions":"","university":"${university}","lab_name":"","research_focus":"3-8 words","recent_paper":"","location_mode":"Remote|Hybrid|In-person","tags":[],"fit_note":"one sentence"}

Page:
${pageText.substring(0, 3200)}`;

  try {
    const contentRaw = await completePrompt({
      user: prompt,
      task: "extract",
    });
    let content = (contentRaw || "").trim();
    if (!content) return null;
    if (content.startsWith("```")) {
      content = content.replace(/```json/g, "").replace(/```/g, "").trim();
    }
    const match = content.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : content);
  } catch {
    return null;
  }
}

export async function importFacultyLead(opts: {
  userId: string;
  name: string;
  university: string;
  title?: string;
  labName?: string | null;
  researchFocus?: string | null;
  recentPaper?: string | null;
  tags?: string[];
  locationMode?: string;
  hintUrl?: string | null;
  specialInstructions?: string | null;
  fitNote?: string | null;
  worksCount?: number | null;
  skillsText: string;
  profile: {
    researchInterests?: string | null;
    workModePref?: string | null;
    location?: string | null;
  } | null;
  minScore: number;
}) {
  const dedupeKey = normalizeDedupeKey(opts.name, opts.university);
  const existing = await prisma.professor.findUnique({
    where: { userId_dedupeKey: { userId: opts.userId, dedupeKey } },
  });
  if (existing) return { skipped: true as const, reason: "duplicate", existingId: existing.id };

  const titleRaw =
    opts.title ||
    inferTitleFromSignals({
      worksCount: opts.worksCount,
      labName: opts.labName,
    });
  const role = classifyFacultyTitle(titleRaw, {
    labName: opts.labName,
    worksCount: opts.worksCount,
  });
  if (!isOutreachTargetRole(role) || role === "postdoc" || role === "student") {
    return { skipped: true as const, reason: "not_faculty_role" };
  }
  const title = normalizeTitleForStorage(titleRaw, role);

  const resolved = await resolveFacultyEmail({
    userId: opts.userId,
    name: opts.name,
    university: opts.university,
    hintUrl: opts.hintUrl,
  });

  let recentPaper = opts.recentPaper || null;
  if (!recentPaper) {
    recentPaper = await findRecentPaperRedundant(
      opts.userId,
      opts.name,
      opts.university,
      opts.researchFocus
    );
  }

  const verifiedEmail = resolved.verified ? resolved.primaryEmail : null;
  const emailVerified = !!resolved.verified && !!verifiedEmail;

  const { score, reason } = scoreProfessorMatch({
    researchInterests: opts.profile?.researchInterests,
    skillsText: opts.skillsText,
    workModePref: opts.profile?.workModePref,
    location: opts.profile?.location,
    professor: {
      researchFocus: opts.researchFocus,
      recentPaper,
      labName: opts.labName,
      tags: opts.tags || [],
      locationMode: opts.locationMode,
      university: opts.university,
    },
  });
  if (score < opts.minScore) {
    return { skipped: true as const, reason: "low_fit", matchScore: score };
  }

  const created = await prisma.professor.create({
    data: {
      userId: opts.userId,
      name: opts.name,
      title,
      email: verifiedEmail,
      ccEmails: toJsonArray([]),
      university: opts.university,
      labName: opts.labName || null,
      researchFocus: opts.researchFocus || null,
      recentPaper,
      locationMode: opts.locationMode || "Remote",
      tags: toJsonArray(opts.tags || []),
      homepageUrl: resolved.sourceUrl || opts.hintUrl || null,
      specialInstructions: opts.specialInstructions || null,
      emailVerified,
      verificationNotes: resolved.reasoning,
      matchScore: score,
      matchReason: opts.fitNote || reason || null,
      dedupeKey,
    },
  });

  return {
    skipped: false as const,
    id: created.id,
    name: opts.name,
    university: opts.university,
    email: verifiedEmail,
    emailVerified,
    matchScore: score,
    title,
    role,
  };
}

async function saveProfessor(
  opts: Parameters<typeof importFacultyLead>[0]
) {
  const result = await importFacultyLead(opts);
  if (result.skipped) return null;
  return {
    name: result.name,
    university: result.university,
    email: result.email,
    emailVerified: result.emailVerified,
    matchScore: result.matchScore,
    title: result.title,
    role: result.role,
  };
}

export async function mineFreshLeads(userId: string, count = 10) {
  const bundle = await getProfileBundle(userId);
  const profile = bundle?.profile;
  const regions = (profile?.targetRegions || []) as string[];
  const skills = (profile?.skills || {}) as {
    languages?: string[];
    frameworks?: string[];
    expertise?: string[];
  };

  const universities = universitiesForRegions(regions).sort(
    () => Math.random() - 0.5
  );
  const topics = topicsFromProfile({
    researchInterests: profile?.researchInterests,
    skills,
    headline: profile?.headline,
  });

  const mined: Array<{
    name: string;
    university: string;
    email?: string | null;
    emailVerified?: boolean;
    matchScore?: number;
  }> = [];

  const skillsText = skillsToText(skills);
  const minScore = Number(process.env.MIN_MATCH_SCORE || 40);
  const profileLite = profile
    ? {
        researchInterests: profile.researchInterests,
        workModePref: profile.workModePref,
        location: profile.location,
      }
    : null;

  for (const university of universities) {
    if (mined.length >= count) break;
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const need = count - mined.length;

    // 1) FREE primary: OpenAlex works → authors
    let oaFaculty: OpenAlexFaculty[] = [];
    try {
      oaFaculty = await discoverFacultyAtUniversity({
        university,
        topic,
        limit: Math.min(8, need + 3),
      });
    } catch (err) {
      console.warn(`[Miner] OpenAlex fail`, err);
    }

    const ranked = oaFaculty
      .map((fac) =>
        rankAuthorCandidate({
          candidate: fac,
          university,
          topic,
          profile: profileLite,
          skillsText,
          existingEmail: null,
        })
      )
      .sort((a, b) => b.total - a.total)
      .slice(0, Math.min(need, 4));

    // Resolve 2 candidates at a time (email search is the slow part)
    const savedBatch = await mapPool(ranked, 2, async (entry) => {
      const fac = entry.candidate;
      return saveProfessor({
        userId,
        name: fac.name,
        university,
        title: inferTitleFromSignals({
          worksCount: fac.worksCount,
          labName: null,
        }),
        researchFocus: fac.researchFocus,
        recentPaper: fac.recentPaper,
        tags: fac.tags,
        hintUrl: fac.homepageUrl,
        worksCount: fac.worksCount,
        skillsText,
        profile: profileLite,
        minScore,
        fitNote: `OpenAlex rank=${entry.total} (${entry.reasons.join("; ")})`,
      });
    });
    for (const saved of savedBatch) {
      if (saved && mined.length < count) mined.push(saved);
    }

    if (mined.length >= count) break;

    // 2) Topic pages: free + Tavily in parallel, then extract
    const pages = await searchTopicPagesRedundant(
      userId,
      university,
      topic,
      4,
      { forceTavily: true }
    );
    const pageResults = await mapPool(pages.slice(0, 3), 2, async (result) => {
      const text = await loadPageTextRedundant(userId, result);
      if (!text || text.length < 80) return null;

      const extracted = await extractFacultyData(
        text,
        university,
        topic,
        userId
      );
      if (!extracted?.valid || !extracted.name) return null;

      return saveProfessor({
        userId,
        name: extracted.name,
        university,
        title: extracted.title,
        labName: extracted.lab_name,
        researchFocus: extracted.research_focus,
        recentPaper: extracted.recent_paper,
        tags: extracted.tags || [],
        locationMode: extracted.location_mode,
        hintUrl: result.url,
        specialInstructions: extracted.specialInstructions,
        fitNote: extracted.fit_note,
        skillsText,
        profile: profileLite,
        minScore,
      });
    });
    for (const saved of pageResults) {
      if (saved && mined.length < count) mined.push(saved);
    }
  }

  mined.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  return {
    mined: mined.length,
    leads: mined,
    targeting: {
      regions,
      topics,
      universitiesTried: universities.slice(0, 8),
      searchMode: "openalex_tavily_parallel",
    },
  };
}
