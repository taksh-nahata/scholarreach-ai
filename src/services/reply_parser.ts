/**
 * Extract actionable opportunities from professor replies (incl. polite declines w/ advice).
 */
import { extractUrls } from "@/services/gmail_body";

export type ReplySentiment =
  | "interested"
  | "decline"
  | "referral"
  | "question"
  | "neutral";

export type ParsedOpportunity = {
  title: string;
  detail: string;
  type: "open_source" | "lab" | "course" | "collaborator" | "program" | "general";
  keywords: string[];
};

export type ParsedLink = {
  url: string;
};

export type ParsedReply = {
  sentiment: ReplySentiment;
  headline: string;
  recommendation: string | null;
  opportunities: ParsedOpportunity[];
  links: ParsedLink[];
};

const OPENSOURCE_RE =
  /\b(open[\s-]?source|github|contribut(e|ing)|pull request|issue tracker)\b/i;
const PROJECT_NAME_RE =
  /\b([A-Z][A-Za-z0-9+.-]{2,}(?:\s+[A-Z][A-Za-z0-9+.-]{2,}){0,3})\b/g;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

function classifySentiment(text: string): ReplySentiment {
  const t = text.toLowerCase();
  const decline =
    /\b(unfortunately|cannot|can't|won't be able|not taking|no openings|all my time|already at capacity|unable to supervise|will not be able|no bandwidth|not accepting|no capacity|not actively recruiting|do not have any|don't have any|sorry)\b/i.test(
      text
    );
  const interested =
    /\b(happy to|would love|let's schedule|available to meet|sounds interesting|please apply|send me your|looking forward)\b/i.test(
      text
    );
  const referral =
    /\b(one way to|you could|try contacting|recommend|suggest|consider working|contribut(e|ing)|open source|another professor|reach out to|best of luck)\b/i.test(
      text
    );
  const question = /\?\s*$/.test(text.trim()) || (t.includes("?") && t.length < 400);

  if (interested && !decline) return "interested";
  if (decline && referral) return "referral";
  if (decline) return "decline";
  if (referral) return "referral";
  if (question) return "question";
  return "neutral";
}

function opportunityType(sentence: string): ParsedOpportunity["type"] {
  if (OPENSOURCE_RE.test(sentence)) return "open_source";
  if (/\b(course|class|lab meeting|office hours)\b/i.test(sentence)) return "course";
  if (/\b(program|summer|REU|internship)\b/i.test(sentence)) return "program";
  if (/\b(collaborator|colleague|postdoc|graduate student)\b/i.test(sentence)) {
    return "collaborator";
  }
  if (/\b(lab|group|team)\b/i.test(sentence)) return "lab";
  return "general";
}

function extractOpportunities(text: string): ParsedOpportunity[] {
  const out: ParsedOpportunity[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences(text)) {
    const advisory =
      /\b(one way|you could|try|consider|recommend|suggest|another option|instead|best path|get into research|working with|contribut(e|ing))\b/i.test(
        sentence
      );
    if (!advisory && !OPENSOURCE_RE.test(sentence)) continue;

    const keywords: string[] = [];
    let match: RegExpExecArray | null;
    PROJECT_NAME_RE.lastIndex = 0;
    while ((match = PROJECT_NAME_RE.exec(sentence)) !== null) {
      const name = match[1].trim();
      if (
        name.length >= 3 &&
        !/^(Thanks|Best|Hi|Hello|Dear|Unfortunately|Georgia|Tech|Georgia Tech)$/i.test(name)
      ) {
        keywords.push(name);
      }
    }

    const title =
      keywords[0] ||
      (OPENSOURCE_RE.test(sentence)
        ? "Open-source contribution path"
        : "Professor suggestion");

    const key = `${title}|${sentence.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      title,
      detail: sentence,
      type: opportunityType(sentence),
      keywords: [...new Set(keywords)].slice(0, 6),
    });
  }

  // Named projects mentioned without advisory sentence (e.g. "GTSAM")
  const gtsam = text.match(/\bGTSAM\b/i);
  if (gtsam) {
    const idx = out.findIndex((o) => /gtsam/i.test(o.title));
    const gtsamOpp = {
      title: "GTSAM",
      detail:
        "Professor mentioned contributing to the GTSAM open-source ecosystem.",
      type: "open_source" as const,
      keywords: ["GTSAM"],
    };
    if (idx >= 0) {
      out[idx] = gtsamOpp;
    } else {
      out.unshift(gtsamOpp);
    }
  }

  return out.slice(0, 6);
}

function pickPrimaryOpportunity(
  opportunities: ParsedOpportunity[]
): ParsedOpportunity | undefined {
  return (
    opportunities.find((o) => o.type === "open_source") ||
    opportunities.find((o) => /gtsam|github|open[\s-]?source/i.test(o.title)) ||
    opportunities.find((o) => o.type !== "general") ||
    opportunities[0]
  );
}

function buildHeadline(
  sentiment: ReplySentiment,
  opportunities: ParsedOpportunity[],
  professorName?: string | null
): string {
  const who = professorName ? professorName.replace(/^Dr\.?\s*/i, "") : "Professor";
  if (sentiment === "interested") {
    return `${who} is interested — follow up to schedule`;
  }
  if (sentiment === "referral" && opportunities[0]) {
    const primary = pickPrimaryOpportunity(opportunities);
    return `${who} declined supervision but suggested: ${primary?.title || opportunities[0].title}`;
  }
  if (sentiment === "decline") {
    return `${who} cannot supervise right now`;
  }
  if (sentiment === "question") {
    return `${who} asked a question — reply needed`;
  }
  return `${who} replied to your outreach`;
}

function buildRecommendation(
  text: string,
  opportunities: ParsedOpportunity[]
): string | null {
  const advisory = sentences(text).filter((s) =>
    /\b(one way|you could|try|consider|recommend|suggest|contribut|open source|working with)\b/i.test(
      s
    )
  );
  if (advisory.length) {
    return advisory.slice(0, 2).join(" ");
  }
  if (opportunities.length) {
    return opportunities.map((o) => o.detail).slice(0, 2).join(" ");
  }
  return null;
}

export function parseProfessorReply(
  rawBody: string,
  opts?: { professorName?: string | null }
): ParsedReply {
  const text = rawBody.replace(/\s+/g, " ").trim();
  const opportunities = extractOpportunities(text);
  const sentiment = classifySentiment(text);
  const links = extractUrls(text).map((url) => ({ url }));

  return {
    sentiment,
    headline: buildHeadline(sentiment, opportunities, opts?.professorName),
    recommendation: buildRecommendation(text, opportunities),
    opportunities,
    links,
  };
}
