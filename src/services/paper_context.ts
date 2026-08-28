/**
 * Fetch paper abstract / themes so outreach can show real familiarity.
 */
import { isUsablePaperTitle } from "@/services/email_acceptance_format";

export type PaperContext = {
  title: string;
  abstract: string | null;
  /** Short plain-language themes from title + abstract */
  themes: string[];
  /** One concrete takeaway sentence (not a claim of "I spent time") */
  insight: string;
  source: "openalex" | "semanticscholar" | "title_only";
};

const MAILTO =
  process.env.OPENALEX_MAILTO ||
  process.env.SEARCH_CONTACT_EMAIL ||
  "scholarreach@users.noreply.github.com";

function reconstructAbstract(
  inverted: Record<string, number[]> | null | undefined
): string | null {
  if (!inverted || typeof inverted !== "object") return null;
  const pairs: Array<{ word: string; pos: number }> = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions || []) pairs.push({ word, pos });
  }
  if (!pairs.length) return null;
  pairs.sort((a, b) => a.pos - b.pos);
  return pairs
    .map((p) => p.word)
    .join(" ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleOverlap(a: string, b: string): number {
  const ta = new Set(normalizeTitle(a).split(" ").filter((w) => w.length > 3));
  const tb = new Set(normalizeTitle(b).split(" ").filter((w) => w.length > 3));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const w of ta) if (tb.has(w)) hit += 1;
  return hit / Math.max(ta.size, tb.size);
}

const STOP = new Set(
  "the a an and or of to in on for with from by as at into during among between over under about how what when where which their its this that these those using based analysis study role paper".split(
    " "
  )
);

export function themesFromText(title: string, abstract?: string | null): string[] {
  const blob = `${title} ${abstract || ""}`.toLowerCase();
  const words = blob
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);

  // Prefer multi-word cues from the title
  const titlePhrases: string[] = [];
  const titleNorm = title
    .replace(/[:.].*$/, "")
    .replace(/\b(an analysis of|a study of|towards|toward)\b/gi, "")
    .trim();
  if (titleNorm.length > 20) titlePhrases.push(titleNorm);

  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);

  return [...titlePhrases, ...top].slice(0, 6);
}

function firstSentences(text: string, maxChars = 280): string {
  let cleaned = text.replace(/\s+/g, " ").trim();
  cleaned = cleaned
    .replace(/^(INTRODUCTION|ABSTRACT|BACKGROUND|METHODS?|RESULTS?|CONCLUSION)\s*:?\s*/i, "")
    .replace(/^[A-Z][a-z]+:\s+(Thank you|Thanks|I am excited)\b[\s\S]*/i, "")
    .trim();
  if (
    /^(thank you|i am excited|bob:|interview|people in control)/i.test(cleaned) ||
    cleaned.length < 40
  ) {
    return "";
  }

  // Prefer complete sentences only
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [];
  let out = "";
  for (const s of sentences) {
    const next = `${out} ${s}`.trim();
    if (next.length > maxChars && out) break;
    out = next;
    if (out.length >= 120) break;
  }
  if (!out) {
    // Fallback: cut at last space before maxChars
    out = cleaned.slice(0, maxChars).replace(/\s+\S*$/, "").trim();
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Build a takeaway that proves engagement without empty "I spent time" fluff. */
export function buildPaperInsight(title: string, abstract: string | null): string {
  if (abstract && abstract.length > 60) {
    let core = firstSentences(abstract, 240);
    // Avoid dangling endings like "organizations (MSOs) in."
    if (core && !/[.!?]$/.test(core)) {
      core = `${core.replace(/\s+(in|of|to|for|and|or|the|a|an)$/i, "")}.`;
    }
    if (core.length >= 50) {
      const clipped =
        core.length > 220
          ? `${core.slice(0, 210).replace(/\s+\S*$/, "").replace(/\s+(in|of|to|for|and|or|the|a|an)$/i, "")}.`
          : core;
      return `A concrete takeaway for me was this: ${clipped}`;
    }
  }

  // Title-only: name the substance of the title (still better than "I spent time")
  const focus = title
    .replace(/^\d+\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/\.+$/, "")
    .replace(/\s*\[[^\]]+\]\s*$/, "")
    .trim();
  return `What drew me in is the specific problem your title frames - ${focus} - and I want to contribute to work in that direction rather than only ask for general advice.`;
}

/** Reject magazine blurbs / non-research titles that waste a cite. */
export function isStrongResearchPaperTitle(title?: string | null): boolean {
  if (!isUsablePaperTitle(title)) return false;
  const t = title!.trim();
  if (/\bpeople in control\b/i.test(t)) return false;
  if (/\binterview\b/i.test(t)) return false;
  if (/^\d{2,4}\s/.test(t)) return false; // page-number prefixed OCR junk
  if (t.length < 28) return false;
  return true;
}

async function fetchOpenAlexAbstract(title: string): Promise<string | null> {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(
    title
  )}&per-page=5&mailto=${encodeURIComponent(MAILTO)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": `ScholarReach/1.0 (mailto:${MAILTO})`,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        title?: string;
        display_name?: string;
        abstract_inverted_index?: Record<string, number[]>;
      }>;
    };
    let best: { abs: string; score: number } | null = null;
    for (const w of data.results || []) {
      const t = (w.title || w.display_name || "").trim();
      const score = titleOverlap(title, t);
      if (score < 0.45) continue;
      const abs = reconstructAbstract(w.abstract_inverted_index);
      if (abs && abs.length > 40) {
        if (!best || score > best.score) best = { abs, score };
      }
    }
    return best?.abs || null;
  } catch {
    return null;
  }
}

async function fetchS2Abstract(title: string): Promise<string | null> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.S2_API_KEY) headers["x-api-key"] = process.env.S2_API_KEY;
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
    title
  )}&limit=5&fields=title,abstract`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: Array<{ title?: string; abstract?: string | null }>;
    };
    let best: { abs: string; score: number } | null = null;
    for (const p of data.data || []) {
      const t = (p.title || "").trim();
      const score = titleOverlap(title, t);
      if (score < 0.45) continue;
      const abs = (p.abstract || "").trim();
      if (abs.length > 40) {
        if (!best || score > best.score) best = { abs, score };
      }
    }
    return best?.abs || null;
  } catch {
    return null;
  }
}

export async function fetchPaperContext(
  title: string | null | undefined
): Promise<PaperContext | null> {
  if (!isUsablePaperTitle(title)) return null;
  const clean = title!
    .trim()
    .replace(/[.]+$/, "")
    .replace(/^\d{2,4}\s+/, "")
    .replace(/\s+/g, " ");

  let abstract = await fetchOpenAlexAbstract(clean);
  let source: PaperContext["source"] = abstract ? "openalex" : "title_only";
  if (!abstract) {
    abstract = await fetchS2Abstract(clean);
    if (abstract) source = "semanticscholar";
  }

  // Drop interview / bio blurb "abstracts"
  if (
    abstract &&
    (/^(thank you|bob:|i am excited)/i.test(abstract.trim()) ||
      /\bpeople in control\b/i.test(clean))
  ) {
    abstract = null;
    source = "title_only";
  }

  const themes = themesFromText(clean, abstract);
  const insight = buildPaperInsight(clean, abstract);
  return { title: clean, abstract, themes, insight, source };
}
