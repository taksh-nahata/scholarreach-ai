/**
 * CC / recipient edge cases for algorithmic outreach (no LLM).
 */
import { parseJsonArray } from "@/lib/utils";
import {
  scoreEmailCandidate,
  EMAIL_VERIFY_THRESHOLD,
} from "@/services/faculty_email_verifier";
import { domainsForUniversity } from "@/lib/university_email_domains";

const CC_ROLE_HINT =
  /\b(lab manager|lab admin|administrative assistant|graduate coordinator|grad coordinator|department coordinator|program coordinator|lab contact|group admin|research admin|office manager|secretary|reception)\b/i;

const CC_LINE_HINT =
  /(?:cc|copy|also contact|please also email|email)\s*[:\-]?\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** Looser than faculty primary filter — allows admin.robotics@, lab.manager@, etc. */
export function isJunkCcEmail(email: string): boolean {
  if (!email || !email.includes("@")) return true;
  const lower = email.toLowerCase().trim();
  const [local = ""] = lower.split("@");
  if (/^(noreply|no-reply|donotreply|info|contact|office|webmaster|support|help|dept|department|admissions)$/i.test(local)) {
    return true;
  }
  if (local === "admin") return true;
  return false;
}

function harvestCcEmails(pageText: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of pageText.matchAll(EMAIL_RE)) {
    const e = m[0].toLowerCase();
    if (isJunkCcEmail(e) || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

export type SpecialInstructions = {
  mentionResearchInterests: boolean;
  mentionAvailability: boolean;
  ccLabContact: boolean;
  includeTranscript: boolean;
  customNote: string | null;
};

export function parseSpecialInstructions(
  raw?: string | null,
  pageText?: string | null
): SpecialInstructions {
  const blob = `${raw || ""}\n${pageText || ""}`.toLowerCase();
  const custom: string[] = [];

  if (/research interests? (in|with) (the )?(email|subject|message)/i.test(blob)) {
    custom.push("mention_research_interests");
  }
  if (/include (your )?(cv|resume|transcript)/i.test(blob)) {
    custom.push("include_cv");
  }
  if (/\bcc\b.*lab|lab manager|graduate coordinator/i.test(blob)) {
    custom.push("cc_lab");
  }

  return {
    mentionResearchInterests:
      custom.includes("mention_research_interests") ||
      /please (include|mention) (your )?research interests/i.test(blob),
    mentionAvailability: /availability|hours per week/i.test(blob),
    ccLabContact: custom.includes("cc_lab"),
    includeTranscript: /transcript/i.test(blob),
    customNote: raw?.trim().slice(0, 240) || null,
  };
}

export function normalizeCcList(
  emails: string[],
  primaryEmail?: string | null,
  max = 3
): string[] {
  const primary = (primaryEmail || "").toLowerCase().trim();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const e = raw.toLowerCase().trim();
    if (!e || !e.includes("@") || isJunkCcEmail(e)) continue;
    if (primary && e === primary) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
    if (out.length >= max) break;
  }
  return out;
}

/** Comma-separated storage for Draft / ScheduledEmail. */
export function formatCcForStorage(emails: string[]): string | null {
  const list = normalizeCcList(emails);
  return list.length ? list.join(", ") : null;
}

export function parseProfessorCc(raw?: string | null): string[] {
  return normalizeCcList(parseJsonArray(raw));
}

function scoreCcCandidate(opts: {
  email: string;
  primaryEmail: string;
  name: string;
  university: string;
  pageText: string;
}): number {
  const lower = opts.pageText.toLowerCase();
  const email = opts.email.toLowerCase();
  let score = 0;

  if (email === opts.primaryEmail.toLowerCase()) return -100;

  const idx = lower.indexOf(email);
  if (idx >= 0) {
    const window = lower.slice(Math.max(0, idx - 80), idx + email.length + 80);
    if (CC_ROLE_HINT.test(window)) score += 40;
    if (/\b(cc|copy|contact)\b/.test(window)) score += 15;
  }

  const scored = scoreEmailCandidate({
    email,
    name: opts.name,
    university: opts.university,
    pageText: opts.pageText,
  });
  if (scored.domainMatch) score += 20;
  if (scored.foundInPage) score += 10;
  if (scored.score >= EMAIL_VERIFY_THRESHOLD) score += 15;

  // Prefer institutional addresses for CC (lab admin, coordinator)
  const allowed = domainsForUniversity(opts.university);
  if (allowed.some((d) => email.endsWith(`@${d}`) || email.includes(`.${d}`))) {
    score += 12;
  }

  // Deprioritize generic inboxes for CC unless labeled
  if (/^(info|contact|admin|office|dept|department)@/i.test(email)) score += 5;
  if (/^(noreply|no-reply|donotreply)@/i.test(email)) score -= 50;

  return score;
}

/** Pick CC addresses evidenced on the same page as the professor email. */
export function pickCcRecipients(opts: {
  primaryEmail: string;
  pageText: string;
  name: string;
  university: string;
  max?: number;
}): string[] {
  const primary = opts.primaryEmail.toLowerCase().trim();
  if (!primary || !opts.pageText) return [];

  const candidates = harvestCcEmails(opts.pageText).filter(
    (e) => e !== primary
  );

  // Explicit "cc: email@..." lines
  for (const m of opts.pageText.matchAll(CC_LINE_HINT)) {
    const e = m[1]?.toLowerCase();
    if (e && !candidates.includes(e)) candidates.push(e);
  }

  const ranked = candidates
    .map((email) => ({
      email,
      score: scoreCcCandidate({
        email,
        primaryEmail: primary,
        name: opts.name,
        university: opts.university,
        pageText: opts.pageText,
      }),
    }))
    .filter((r) => r.score >= 25)
    .sort((a, b) => b.score - a.score);

  return normalizeCcList(
    ranked.map((r) => r.email),
    primary,
    opts.max ?? 2
  );
}

/** Post-process template letter for edge cases and faculty-page instructions. */
export function polishOutreachLetter(opts: {
  subject: string;
  body: string;
  greeting: string;
  studentName: string;
  researchInterests?: string | null;
  special?: SpecialInstructions | null;
  ccEmails?: string[];
  willAttach: boolean;
}): { subject: string; body: string } {
  let subject = opts.subject.trim();
  let body = opts.body.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  // Greeting must match computed greeting
  const lines = body.split("\n");
  if (lines[0] && !lines[0].startsWith(opts.greeting.split(",")[0])) {
    lines[0] = opts.greeting;
    body = lines.join("\n");
  }

  const interests = (opts.researchInterests || "").trim();
  if (
    opts.special?.mentionResearchInterests &&
    interests &&
    !body.toLowerCase().includes(interests.toLowerCase().slice(0, 24))
  ) {
    const introEnd = body.indexOf("\n\n", body.indexOf("\n") + 1);
    const insertAt = introEnd > 0 ? introEnd : body.indexOf("\n\n") + 2;
    const snippet = interests.split(/[.;]/)[0]?.trim();
    if (snippet && snippet.length > 8) {
      const line = `My main research interests include ${snippet}.`;
      body =
        body.slice(0, insertAt) +
        (insertAt ? "\n\n" : "") +
        line +
        body.slice(insertAt);
    }
  }

  // Empty offer section guard: if we promised bullets but have none
  if (
    /Here is the experience I would bring/.test(body) &&
    !/^\s*•\s+/m.test(body)
  ) {
    body = body.replace(
      /Here is the experience I would bring[^\n]*:\n\n/,
      "I would be glad to contribute careful Python, data, and research-support work for your group.\n\n"
    );
  }

  // Weak closing duplicate
  body = body.replace(
    /(Thank you for your time,\s*\n\s*\n\s*[^\n]+)\s*\n\s*Thank you for your time,/i,
    "$1"
  );

  if (opts.special?.ccLabContact && opts.ccEmails?.length) {
    if (!/\b(copied|cc['']?d|cc:)\b/i.test(body)) {
      body = body.replace(
        /(Thank you for your time,)/i,
        "(I have copied your lab contact on this message.)\n\n$1"
      );
    }
  }

  if (opts.special?.includeTranscript && opts.willAttach) {
    if (!/\btranscript\b/i.test(body)) {
      body = body.replace(
        /(I have attached [^.]+\.)/i,
        "$1 I can also share a transcript if helpful."
      );
    }
  }

  if (subject.length > 78) {
    subject = `${subject.slice(0, 75)}…`;
  }

  return { subject, body };
}
