/**
 * Regex/heuristic faculty extraction from HTML/text — no LLM credits.
 */
const FACULTY_TITLES =
  /(?:Associate|Assistant|Full|Adjunct|Visiting|Research|Principal)?\s*(?:Professor|PI|Investigator|Lecturer|Faculty)/i;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

export type HeuristicFacultyExtract = {
  valid: boolean;
  name?: string;
  title?: string;
  email?: string;
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

/** Pull a plausible faculty name from page text (no LLM). */
export function extractFacultyHeuristic(
  pageText: string,
  university: string,
  topicHint: string
): HeuristicFacultyExtract | null {
  const text = pageText.replace(/\s+/g, " ").slice(0, 8000);
  const lower = text.toLowerCase();

  if (
    /\b(undergraduate|graduate student|ph\.?d\.?\s+student|postdoc|post-doc)\b/i.test(
      lower
    ) &&
    !FACULTY_TITLES.test(text)
  ) {
    return null;
  }

  let name: string | null = null;
  const drMatch = text.match(
    /(?:Dr\.|Professor|Prof\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,3})/i
  );
  if (drMatch) {
    name = `Dr. ${titleCaseName(drMatch[1])}`;
  } else {
    const h1 = text.match(/<h1[^>]*>([^<]{4,80})<\/h1>/i);
    if (h1 && /[A-Z][a-z]+\s+[A-Z][a-z]+/.test(h1[1])) {
      name = titleCaseName(h1[1].replace(/<[^>]+>/g, ""));
    }
  }
  if (!name) return null;

  const titleMatch = text.match(FACULTY_TITLES);
  const title = titleMatch ? titleMatch[0].trim() : "Professor";

  const emails = [...text.matchAll(EMAIL_RE)]
    .map((m) => m[0].toLowerCase())
    .filter((e) => !/example\.com|email@|noreply|wordpress/i.test(e));
  const email = emails[0] || "";

  const quoted = text.match(/"([^"]{18,120})"/);
  const recent_paper = quoted?.[1]?.trim() || "";

  const focusWords = topicHint
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 4)
    .join(" ");

  return {
    valid: true,
    name,
    title,
    email,
    university,
    lab_name: "",
    research_focus: focusWords || topicHint.slice(0, 48),
    recent_paper,
    location_mode: "Remote",
    tags: [],
    fit_note: `Heuristic extract from faculty page (${topicHint.slice(0, 40)})`,
    specialInstructions: "",
  };
}
