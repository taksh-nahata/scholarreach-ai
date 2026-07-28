/**
 * ScholarReach AI — Faculty Discovery Miner with name+university dedupe
 */
import { prisma } from "@/lib/prisma";
import { normalizeDedupeKey, toJsonArray } from "@/lib/utils";
import { exaClient } from "./exa_client";
import { tavilyClient } from "./tavily_client";
import { firecrawlClient } from "./firecrawl_client";
import { unscrambleEmail, isPlaceholderEmail, verifyFacultyEmail } from "./faculty_email_verifier";

const TARGET_UNIVERSITIES = [
  "UC Berkeley",
  "UCLA",
  "UC San Diego",
  "Stanford University",
  "MIT",
  "Carnegie Mellon University",
  "Columbia University",
  "Cornell University",
  "Princeton University",
  "Georgia Tech",
  "University of Michigan",
  "UT Austin",
  "University of Toronto",
  "ETH Zurich",
  "University of Oxford",
];

const TOPICS = [
  "Robotics, Computer Vision, or Embedded Systems",
  "Machine Learning, Artificial Intelligence, or LLMs",
];

async function extractFacultyData(pageText: string, university: string) {
  const base = process.env.PROVOCATIVE_BASE_URL;
  const key = process.env.PROVOCATIVE_API_KEY;
  if (!base || !key) return null;

  const prompt = `You are an AI data extractor. Extract the faculty member's information from the following webpage text.
Return ONLY valid JSON.

Required JSON format:
{
  "valid": true,
  "name": "Dr. Full Name",
  "title": "Professor",
  "email": "faculty@university.edu",
  "ccEmails": [],
  "specialInstructions": "",
  "university": "${university}",
  "lab_name": "Lab Name",
  "research_focus": "3-6 word focus",
  "recent_paper": "",
  "location_mode": "Remote",
  "tags": ["AI/ML"]
}

Webpage Text:
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

export async function mineFreshLeads(userId: string, count = 20) {
  const mined: Array<{ name: string; university: string; email?: string }> = [];
  const universities = [...TARGET_UNIVERSITIES].sort(() => Math.random() - 0.5);

  for (const university of universities) {
    if (mined.length >= count) break;
    const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    const results = await tavilyClient.searchFacultyPages(university, topic, 3);

    for (const result of results) {
      if (mined.length >= count) break;
      const markdown = await firecrawlClient.scrapeUrl(result.url);
      const text =
        markdown ||
        (await exaClient.searchWeb(`"${result.title}" ${university} faculty email`));
      if (!text || text.length < 80) continue;

      const extracted = await extractFacultyData(text, university);
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

      if (email || extracted.name) {
        const verified = await verifyFacultyEmail(extracted.name, university, email);
        verifiedEmail = verified.primaryEmail || email;
        ccEmails = Array.from(new Set([...(ccEmails || []), ...verified.ccEmails]));
        emailVerified = verified.verified;
        verificationNotes = verified.reasoning;
      }

      if (!extracted.recent_paper) {
        const paper = await exaClient.findRecentPaper(
          extracted.name,
          university,
          extracted.research_focus || topic
        );
        if (paper) extracted.recent_paper = paper;
      }

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
          dedupeKey,
        },
      });

      mined.push({ name: extracted.name, university, email: verifiedEmail });
    }
  }

  return { mined: mined.length, leads: mined };
}
