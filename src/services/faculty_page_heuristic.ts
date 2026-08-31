/**
 * Regex/heuristic faculty extraction from HTML/text — no LLM credits.
 */
import {
  pageMentionsName,
  pickBestEmailFromPage,
  EMAIL_VERIFY_THRESHOLD,
} from "@/services/faculty_email_verifier";
import {
  pickCcRecipients,
  parseSpecialInstructions,
} from "@/services/outreach_recipients";
import { isUsablePaperTitle } from "@/services/email_acceptance_format";

const FACULTY_TITLES =
  /(?:Associate|Assistant|Full|Adjunct|Visiting|Research|Principal)?\s*(?:Professor|PI|Investigator|Lecturer|Faculty)/i;

const STUDENT_ROLES =
  /\b(undergraduate student|graduate student|ph\.?d\.?\s+student|master'?s student|postdoc|post-doc|doctoral candidate)\b/i;

export type HeuristicFacultyExtract = {
  valid: boolean;
  name?: string;
  title?: string;
  email?: string;
  ccEmails?: string[];
  university?: string;
  lab_name?: string;
  research_focus?: string;
  recent_paper?: string;
  location_mode?: string;
  tags?: string[];
  fit_note?: string;
  specialInstructions?: string;
};

function titleCaseName(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractName(text: string): string | null {
  const drMatch = text.match(
    /(?:Dr\.|Professor|Prof\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,3})/i
  );
  if (drMatch) return `Dr. ${titleCaseName(drMatch[1])}`;

  const jsonLd = text.match(
    /"name"\s*:\s*"([^"]{4,80})"/i
  );
  if (jsonLd && /[A-Z][a-z]+\s+[A-Z][a-z]+/.test(jsonLd[1])) {
    const n = titleCaseName(jsonLd[1]);
    if (!/university|department|college|school/i.test(n)) return n.startsWith("Dr") ? n : `Dr. ${n}`;
  }

  const ogTitle = text.match(
    /property="og:title"\s+content="([^"]{4,80})"/i
  );
  if (ogTitle) {
    const cleaned = stripHtml(ogTitle[1]).split(/[|\-–—]/)[0]?.trim();
    if (cleaned && /[A-Z][a-z]+\s+[A-Z][a-z]+/.test(cleaned)) {
      return cleaned.match(/^Dr\.?\s/i)
        ? titleCaseName(cleaned)
        : `Dr. ${titleCaseName(cleaned)}`;
    }
  }

  const h1 = text.match(/<h1[^>]*>([^<]{4,80})<\/h1>/i);
  if (h1) {
    const cleaned = stripHtml(h1[1]);
    if (/[A-Z][a-z]+\s+[A-Z][a-z]+/.test(cleaned) && !/department|university|lab$/i.test(cleaned)) {
      return cleaned.match(/^Dr\.?\s/i)
        ? titleCaseName(cleaned)
        : `Dr. ${titleCaseName(cleaned)}`;
    }
  }

  return null;
}

function extractLabName(text: string): string {
  const lab =
    text.match(/\b([A-Z][A-Za-z0-9 '&-]{2,40}\s+Lab)\b/) ||
    text.match(/\bLaboratory of\s+([A-Z][^.<\n]{4,60})/i);
  return lab ? lab[1].replace(/\s+Lab$/, " Lab").trim() : "";
}

function extractPaperTitle(text: string): string {
  const quoted = [...text.matchAll(/"([^"]{18,140})"/g)].map((m) => m[1].trim());
  for (const q of quoted) {
    if (isUsablePaperTitle(q)) return q;
  }
  const pub = text.match(
    /(?:Selected publications?|Recent publications?|Representative publications?)[:\s]*([^.!\n]{20,120})/i
  );
  if (pub) {
    const candidate = pub[1].split(/[.;]/)[0]?.trim();
    if (candidate && isUsablePaperTitle(candidate)) return candidate;
  }
  return "";
}

function extractResearchFocus(text: string, topicHint: string): string {
  const research = text.match(
    /Research (?:interests?|areas?)[:\s]*([^.!\n<]{12,120})/i
  );
  if (research) {
    const f = research[1].trim().split(/[.;]/)[0]?.trim();
    if (f && f.length > 8) return f.slice(0, 80);
  }
  const focusWords = topicHint
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5)
    .join(" ");
  return focusWords || topicHint.slice(0, 48);
}

/** Pull a plausible faculty record from page text (no LLM). */
export function extractFacultyHeuristic(
  pageText: string,
  university: string,
  topicHint: string
): HeuristicFacultyExtract | null {
  const text = pageText.slice(0, 12000);
  const plain = stripHtml(text);
  const lower = plain.toLowerCase();

  if (STUDENT_ROLES.test(lower) && !FACULTY_TITLES.test(plain)) {
    return null;
  }
  if (/\b(staff directory|all faculty|people directory)\b/i.test(lower) && !/<h1/i.test(text)) {
    return null;
  }

  const name = extractName(text);
  if (!name) return null;
  if (!pageMentionsName(plain, name)) return null;

  const titleMatch = plain.match(FACULTY_TITLES);
  const title = titleMatch ? titleMatch[0].trim() : "Professor";

  const best = pickBestEmailFromPage({
    pageText: plain,
    name,
    university,
    homepageUrl: null,
  });
  const email =
    best && best.score.score >= EMAIL_VERIFY_THRESHOLD ? best.email : "";

  const ccEmails = email
    ? pickCcRecipients({
        primaryEmail: email,
        pageText: plain,
        name,
        university,
        max: 2,
      })
    : [];

  const special = parseSpecialInstructions(null, plain);
  const specialInstructions = special.customNote || "";

  const recent_paper = extractPaperTitle(plain);
  const lab_name = extractLabName(plain);
  const research_focus = extractResearchFocus(plain, topicHint);

  const location_mode = /\b(remote|virtual)\b/i.test(lower)
    ? "Remote"
    : /\bhybrid\b/i.test(lower)
      ? "Hybrid"
      : "Remote";

  return {
    valid: true,
    name,
    title,
    email,
    ccEmails,
    university,
    lab_name,
    research_focus,
    recent_paper,
    location_mode,
    tags: topicHint
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 4),
    fit_note: `Heuristic page extract (${topicHint.slice(0, 40)})`,
    specialInstructions: specialInstructions || undefined,
  };
}
