/**
 * Mentorship evidence from lab/faculty pages only (never LinkedIn).
 * Used for silent ranking boost + optional email line when HS students are documented.
 */

export type MentorshipLevel =
  | "high_school"
  | "undergraduate"
  | "summer_intern"
  | "reu";

export type MentorshipEvidence = {
  level: MentorshipLevel;
  sourceUrl: string;
  snippet: string;
  topicHint?: string;
};

const TEAM_CONTEXT =
  /\b(team|members|people|students|alumni|researchers|group|lab|mentees?|assistants?)\b/i;

const HS_SIGNALS: Array<{ level: MentorshipLevel; re: RegExp }> = [
  { level: "high_school", re: /\bhigh[\s-]?school (?:student|researcher|intern|volunteer|scholar)\b/i },
  { level: "high_school", re: /\bHS (?:student|researcher|intern)\b/i },
  { level: "high_school", re: /\((?:high school|HS)(?:\s+student)?\)/i },
  { level: "high_school", re: /\bpre[\s-]?college (?:researcher|student|intern)\b/i },
];

const UG_SIGNALS: Array<{ level: MentorshipLevel; re: RegExp }> = [
  { level: "undergraduate", re: /\bundergraduate (?:student|researcher|research assistant)\b/i },
  { level: "undergraduate", re: /\bundergrad(?:uate)? (?:researcher|RA)\b/i },
  { level: "summer_intern", re: /\bsummer (?:research )?intern\b/i },
  { level: "reu", re: /\bREU (?:student|participant|scholar)\b/i },
];

/** Only .edu lab/people pages — not news articles or third-party sites. */
export function isTrustedLabPageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!host.endsWith(".edu") && !host.includes(".edu.")) return false;
    if (/^news\./i.test(host) || host.startsWith("news.")) return false;
    if (/\/(news|press|events|article|blog|spotlight)\//i.test(u.pathname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function contextWindow(text: string, index: number, len: number): string {
  const start = Math.max(0, index - 140);
  const end = Math.min(text.length, index + len + 140);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function hasTeamContext(window: string): boolean {
  return (
    TEAM_CONTEXT.test(window) ||
    /\blab\b/i.test(window) ||
    /\bresearch group\b/i.test(window)
  );
}

function scanSignals(
  plain: string,
  sourceUrl: string,
  signals: Array<{ level: MentorshipLevel; re: RegExp }>
): MentorshipEvidence[] {
  const out: MentorshipEvidence[] = [];
  for (const { level, re } of signals) {
    const match = plain.match(re);
    if (!match || match.index == null) continue;
    const window = contextWindow(plain, match.index, match[0].length);
    if (!hasTeamContext(window)) continue;
    out.push({
      level,
      sourceUrl,
      snippet: window.slice(0, 220),
    });
    break;
  }
  return out;
}

/** Extract mentorship signals from a lab/faculty page (caller must pass page text). */
export function extractMentorshipEvidence(
  pageText: string,
  sourceUrl: string
): MentorshipEvidence[] {
  if (!pageText || pageText.length < 80 || !isTrustedLabPageUrl(sourceUrl)) {
    return [];
  }
  const plain = pageText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  const found = [
    ...scanSignals(plain, sourceUrl, HS_SIGNALS),
    ...scanSignals(plain, sourceUrl, UG_SIGNALS),
  ];

  const seen = new Set<string>();
  return found.filter((e) => {
    const key = `${e.level}|${e.snippet.slice(0, 60)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseProfessorMentorshipEvidence(
  raw?: string | null
): MentorshipEvidence[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) =>
        e &&
        typeof e.sourceUrl === "string" &&
        isTrustedLabPageUrl(e.sourceUrl) &&
        typeof e.snippet === "string" &&
        e.snippet.length > 8
    ) as MentorshipEvidence[];
  } catch {
    return [];
  }
}

export function mergeMentorshipEvidence(
  existing: MentorshipEvidence[],
  incoming: MentorshipEvidence[]
): MentorshipEvidence[] {
  const seen = new Set<string>();
  const out: MentorshipEvidence[] = [];
  for (const e of [...existing, ...incoming]) {
    const key = `${e.level}|${e.sourceUrl}|${e.snippet.slice(0, 48)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= 4) break;
  }
  return out;
}

export function serializeMentorshipEvidence(
  items: MentorshipEvidence[]
): string | null {
  const clean = mergeMentorshipEvidence([], items);
  return clean.length ? JSON.stringify(clean) : null;
}

export function hasHighSchoolLabEvidence(
  evidence: MentorshipEvidence[]
): boolean {
  return evidence.some(
    (e) => e.level === "high_school" && isTrustedLabPageUrl(e.sourceUrl)
  );
}

export function hasAnyLabMentorshipEvidence(
  evidence: MentorshipEvidence[]
): boolean {
  return evidence.some((e) => isTrustedLabPageUrl(e.sourceUrl));
}

/** Silent match-score boost (ranking only — not shown in email unless HS line applies). */
export function mentorshipMatchBonus(evidence: MentorshipEvidence[]): {
  bonus: number;
  reason: string;
} {
  if (!hasAnyLabMentorshipEvidence(evidence)) {
    return { bonus: 0, reason: "" };
  }
  if (hasHighSchoolLabEvidence(evidence)) {
    return { bonus: 16, reason: "lab page documents HS researchers" };
  }
  return { bonus: 9, reason: "lab page documents student researchers" };
}

/**
 * Email line only when HS mentorship is documented on the group's own .edu page.
 * Returns empty string otherwise — letter stays normal.
 */
export function mentorshipEmailLine(opts: {
  evidence: MentorshipEvidence[];
  researchFocus?: string | null;
  paperTitle?: string | null;
  labName?: string | null;
}): string {
  if (!hasHighSchoolLabEvidence(opts.evidence)) return "";

  const topic =
    (opts.researchFocus || "").split(/[.;\n]/)[0]?.trim() ||
    (opts.paperTitle || "").split(/[.;\n]/)[0]?.trim() ||
    (opts.labName ? `work in the ${opts.labName}` : "") ||
    "topics like yours";

  const topicPhrase = topic.length > 72 ? `${topic.slice(0, 69)}…` : topic;

  return `I saw that your group has worked with high school researchers on ${topicPhrase}.`;
}
