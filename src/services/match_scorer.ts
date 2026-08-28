/**
 * Lightweight fit score between a student profile and a mined professor.
 * Keyword/phrase overlap + paper/focus bonuses (no extra API calls).
 */
export type MatchInput = {
  researchInterests?: string | null;
  skillsText?: string;
  workModePref?: string | null;
  location?: string | null;
  professor: {
    researchFocus?: string | null;
    recentPaper?: string | null;
    labName?: string | null;
    tags?: string[] | null;
    locationMode?: string | null;
    university?: string | null;
  };
};

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "are",
  "was",
  "research",
  "professor",
  "university",
  "lab",
  "using",
  "based",
  "student",
  "work",
]);

/** Bigram phrases for slightly smarter topical match */
function phrases(text: string): string[] {
  const toks = tokens(text).filter((t) => !STOP.has(t));
  const out: string[] = [];
  for (let i = 0; i < toks.length - 1; i++) {
    out.push(`${toks[i]} ${toks[i + 1]}`);
  }
  return out;
}

export function scoreProfessorMatch(input: MatchInput): {
  score: number;
  reason: string;
} {
  const studentBlob = [
    input.researchInterests || "",
    input.skillsText || "",
  ].join(" ");
  const focusBlob = [
    input.professor.researchFocus || "",
    ...(input.professor.tags || []),
    input.professor.labName || "",
  ].join(" ");
  const paperBlob = input.professor.recentPaper || "";
  const profBlob = `${focusBlob} ${paperBlob}`;

  const sTokens = new Set(tokens(studentBlob).filter((t) => !STOP.has(t)));
  const pTokens = tokens(profBlob).filter((t) => !STOP.has(t));
  const sPhrases = new Set(phrases(studentBlob));
  const pPhrases = phrases(focusBlob);

  if (!sTokens.size || !pTokens.length) {
    return {
      score: 35,
      reason: "Limited profile or faculty topic data — medium default fit.",
    };
  }

  let hits = 0;
  const matched: string[] = [];
  for (const t of pTokens) {
    if (sTokens.has(t)) {
      hits += 1;
      if (matched.length < 6 && !matched.includes(t)) matched.push(t);
    }
  }
  let phraseHits = 0;
  for (const ph of pPhrases) {
    if (sPhrases.has(ph)) {
      phraseHits += 1;
      if (matched.length < 6 && !matched.includes(ph)) matched.push(ph);
    }
  }

  const overlap = hits / Math.max(pTokens.length, 1);
  let score = Math.round(20 + overlap * 55 + Math.min(15, phraseHits * 5));

  // Concrete paper title with shared tokens is a strong personalization signal
  if (paperBlob.trim().length > 12) {
    const paperToks = tokens(paperBlob).filter((t) => !STOP.has(t) && sTokens.has(t));
    if (paperToks.length >= 2) score += 12;
    else if (paperToks.length === 1) score += 6;
    else score += 3; // paper present even without overlap
  }

  // Work-mode nudge
  const mode = (input.professor.locationMode || "").toLowerCase();
  const pref = (input.workModePref || "remote").toLowerCase();
  if (pref.includes("remote") && mode.includes("remote")) score += 5;
  if (pref.includes("person") && (mode.includes("in") || mode.includes("local"))) {
    score += 5;
  }

  score = Math.max(5, Math.min(98, score));
  const reason = matched.length
    ? `Overlap on: ${matched.join(", ")}${paperBlob ? " · paper noted" : ""}`
    : "Weak topical overlap — review before drafting.";

  return { score, reason };
}

export function skillsToText(skills: unknown): string {
  if (!skills || typeof skills !== "object") return "";
  const s = skills as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ["languages", "frameworks", "frameworks_and_libraries", "expertise"]) {
    const v = s[key];
    if (Array.isArray(v)) parts.push(...v.map(String));
    else if (typeof v === "string") parts.push(v);
  }
  return parts.join(" ");
}
