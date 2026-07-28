/**
 * Profile-aware faculty discovery.
 * Targets universities from the student's regions and topics from their interests/skills.
 * Conserves Exa: prefer Tavily snippets + Firecrawl; Exa only when budget remains.
 */
import { prisma } from "@/lib/prisma";
import { normalizeDedupeKey, toJsonArray } from "@/lib/utils";
import { universitiesForRegions, topicsFromProfile } from "@/lib/university_pools";
import { getProfileBundle } from "@/services/profile_service";
import { scoreProfessorMatch, skillsToText } from "@/services/match_scorer";
import { tryConsumeApi } from "@/services/api_budget";
import { exaClient } from "./exa_client";
import { tavilyClient } from "./tavily_client";
import { firecrawlClient } from "./firecrawl_client";
import {
  unscrambleEmail,
  isPlaceholderEmail,
  verifyFacultyEmail,
} from "./faculty_email_verifier";

async function extractFacultyData(
  pageText: string,
  university: string,
  topicHint: string,
  userId: string
) {
  const base = process.env.PROVOCATIVE_BASE_URL;
  const key = process.env.PROVOCATIVE_API_KEY;
  if (!base || !key) return null;
  if (!(await tryConsumeApi(userId, "llm", 1))) return null;

  const prompt = `You are an AI data extractor for academic faculty pages.
Student is looking for faculty related to: ${topicHint}
Extract ONE faculty member who best matches that interest from the page.
Return ONLY valid JSON.

{
  "valid": true,
  "name": "Dr. Full Name",
  "title": "Professor",
  "email": "faculty@university.edu",
  "ccEmails": [],
  "specialInstructions": "",
  "university": "${university}",
  "lab_name": "Lab Name",
  "research_focus": "3-8 word focus matching student interest when possible",
  "recent_paper": "specific paper title if present else empty",
  "location_mode": "Remote|Hybrid|In-person",
  "tags": ["topic","tags"],
  "fit_note": "one sentence why they match the student interest"
}

If the page is not a faculty profile, set "valid": false.

Webpage:
${pageText.substring(0, 5000)}`;

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.PRIMARY_MODEL || "qwen3.6-35b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });
    const data = (await response.json()) as {
      choices?: Array<{ message: { content: string } }>;
    };
    let content = data.choices?.[0]?.message?.content?.trim() || "";
    if (content.startsWith("```")) {
      content = content.replace(/```json/g, "").replace(/```/g, "").trim();
    }
    return JSON.parse(content);
  } catch {
    return null;
  }
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
    email?: string;
    matchScore?: number;
  }> = [];

  const skillsText = skillsToText(skills);
  const minScore = Number(process.env.MIN_MATCH_SCORE || 40);

  for (const university of universities) {
    if (mined.length >= count) break;
    const topic = topics[Math.floor(Math.random() * topics.length)];

    if (!(await tryConsumeApi(userId, "tavily", 1))) break;
    const results = await tavilyClient.searchFacultyPages(university, topic, 2);

    for (const result of results) {
      if (mined.length >= count) break;

      let text = result.snippet || "";
      if (text.length < 200) {
        if (await tryConsumeApi(userId, "firecrawl", 1)) {
          const md = await firecrawlClient.scrapeUrl(result.url);
          if (md) text = md;
        }
      }
      if (text.length < 80 && (await tryConsumeApi(userId, "exa", 1))) {
        text = await exaClient.searchWeb(
          `"${result.title}" ${university} faculty ${topic}`
        );
      }
      if (!text || text.length < 80) continue;

      const extracted = await extractFacultyData(text, university, topic, userId);
      if (!extracted?.valid || !extracted.name) continue;

      const email = unscrambleEmail(extracted.email || "");
      if (email && isPlaceholderEmail(email)) continue;

      const dedupeKey = normalizeDedupeKey(extracted.name, university);
      const existing = await prisma.professor.findUnique({
        where: { userId_dedupeKey: { userId, dedupeKey } },
      });
      if (existing) continue;

      let verifiedEmail = email;
      let ccEmails: string[] = extracted.ccEmails || [];
      let emailVerified = false;
      let verificationNotes = "";

      const looksGood =
        !!email && email.includes(".edu") && !isPlaceholderEmail(email);

      if (!looksGood && (email || extracted.name)) {
        if (await tryConsumeApi(userId, "exa", 1)) {
          const verified = await verifyFacultyEmail(
            extracted.name,
            university,
            email,
            userId
          );
          verifiedEmail = verified.primaryEmail || email;
          ccEmails = Array.from(
            new Set([...(ccEmails || []), ...verified.ccEmails])
          );
          emailVerified = verified.verified;
          verificationNotes = verified.reasoning;
        }
      } else if (looksGood) {
        emailVerified = true;
        verificationNotes =
          "Accepted institutional email without Exa (budget save).";
      }

      if (!extracted.recent_paper && (await tryConsumeApi(userId, "exa", 1))) {
        const paper = await exaClient.findRecentPaper(
          extracted.name,
          university,
          extracted.research_focus || topic
        );
        if (paper) extracted.recent_paper = paper;
      }

      const { score, reason } = scoreProfessorMatch({
        researchInterests: profile?.researchInterests,
        skillsText,
        workModePref: profile?.workModePref,
        location: profile?.location,
        professor: {
          researchFocus: extracted.research_focus,
          recentPaper: extracted.recent_paper,
          labName: extracted.lab_name,
          tags: extracted.tags || [],
          locationMode: extracted.location_mode,
          university,
        },
      });

      if (score < minScore) continue;

      await prisma.professor.create({
        data: {
          userId,
          name: extracted.name,
          title: extracted.title || "Professor",
          email: verifiedEmail || null,
          ccEmails: toJsonArray(ccEmails),
          university,
          labName: extracted.lab_name || null,
          researchFocus: extracted.research_focus || null,
          recentPaper: extracted.recent_paper || null,
          locationMode: extracted.location_mode || "Remote",
          tags: toJsonArray(extracted.tags || []),
          homepageUrl: result.url,
          specialInstructions: extracted.specialInstructions || null,
          emailVerified,
          verificationNotes,
          matchScore: score,
          matchReason: reason || extracted.fit_note || null,
          dedupeKey,
        },
      });

      mined.push({
        name: extracted.name,
        university,
        email: verifiedEmail,
        matchScore: score,
      });
    }
  }

  mined.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  return {
    mined: mined.length,
    leads: mined,
    targeting: { regions, topics, universitiesTried: universities.slice(0, 8) },
  };
}
