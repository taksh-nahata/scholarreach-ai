/**
 * Lightweight fit score between a student profile and a mined professor.
 * No extra API calls — keyword/overlap heuristics only (free).
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
]);

export function scoreProfessorMatch(input: MatchInput): {
  score: number;
  reason: string;
} {
  const studentBlob = [
    input.researchInterests || "",
    input.skillsText || "",
  ].join(" ");
  const profBlob = [
    input.professor.researchFocus || "",
    input.professor.recentPaper || "",
    input.professor.labName || "",
    ...(input.professor.tags || []),
  ].join(" ");

  const sTokens = new Set(tokens(studentBlob).filter((t) => !STOP.has(t)));
  const pTokens = tokens(profBlob).filter((t) => !STOP.has(t));
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
  const overlap = hits / Math.max(pTokens.length, 1);
  let score = Math.round(25 + overlap * 70);

  // Work-mode nudge
  const mode = (input.professor.locationMode || "").toLowerCase();
  const pref = (input.workModePref || "remote").toLowerCase();
  if (pref.includes("remote") && mode.includes("remote")) score += 5;
  if (pref.includes("person") && (mode.includes("in") || mode.includes("local"))) {
    score += 5;
  }

  score = Math.max(5, Math.min(98, score));
  const reason = matched.length
    ? `Overlap on: ${matched.join(", ")}`
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
