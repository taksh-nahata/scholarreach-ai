/**
 * Faculty email sanitization, scoring, and legacy Exa audit helpers.
 * Prefer resolveFacultyEmail (human directory → personal/lab flow) for new code.
 */
import {
  domainsForUniversity,
  emailDomain,
  emailMatchesUniversityDomains,
  isInstitutionalDomain,
} from "@/lib/university_email_domains";
import { ExaClient } from "./exa_client";

export function unscrambleEmail(str: string): string {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/\[\s*at\s*\]|\(\s*at\s*\)|\s+at\s+/gi, "@")
    .replace(/\[\s*dot\s*\]|\(\s*dot\s*\)|\s+dot\s+/gi, ".")
    .replace(/\s+/g, "")
    .trim();
}

const PLACEHOLDER_LOCALS = [
  "my-last-name",
  "lastname",
  "firstname",
  "firstnamelastname",
  "first.last",
  "your-name",
  "yourname",
  "username",
  "placeholder",
  "example",
  "email",
];

const JUNK_LOCAL_EXACT = new Set([
  "info",
  "contact",
  "admin",
  "support",
  "help",
  "office",
  "department",
  "dept",
  "admissions",
  "recruiting",
  "webmaster",
  "noreply",
  "no-reply",
  "postmaster",
  "mailer-daemon",
  "enquiries",
  "inquiry",
  "hr",
  "careers",
]);

export function isPlaceholderEmail(email: string): boolean {
  if (!email || typeof email !== "string") return true;
  const lower = email.toLowerCase().trim();
  if (!lower.includes("@") || !lower.includes(".")) return true;
  const localPart = lower.split("@")[0] || "";
  if (PLACEHOLDER_LOCALS.some((p) => localPart.includes(p))) return true;
  if (JUNK_LOCAL_EXACT.has(localPart)) return true;
  return false;
}

export function isJunkFacultyEmail(email: string): boolean {
  if (!email || typeof email !== "string") return true;
  const lower = unscrambleEmail(email).toLowerCase();
  if (!lower.includes("@")) return true;
  if (isPlaceholderEmail(lower)) return true;
  const [local = "", domain = ""] = lower.split("@");
  if (JUNK_LOCAL_EXACT.has(local)) return true;
  if (
    /^(info|contact|office|admin|support|help|dept|department|admissions|recruiting|webmaster|noreply|no-reply)[-._]/i.test(
      local
    )
  ) {
    return true;
  }
  if (
    /(student|students|alumni|ugrad|undergrad|gradadmit|postdoc-list)/i.test(
      local
    ) ||
    /(^|\.)(students|alumni|ugrad|undergrad)\./i.test(domain)
  ) {
    return true;
  }
  return false;
}

export function nameTokens(name: string): string[] {
  return name
    .replace(/^dr\.?\s*/i, "")
    .replace(/^prof\.?\s*/i, "")
    .replace(/[^a-zA-Z\s'-]/g, " ")
    .trim()
    .split(/[\s'-]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 1);
}

export function nameMatchesLocalPart(name: string, email: string): boolean {
  const local = (email.split("@")[0] || "").toLowerCase();
  const tokens = nameTokens(name);
  if (!tokens.length || !local) return false;
  const last = tokens[tokens.length - 1];
  const first = tokens[0];
  if (last.length > 2 && local.includes(last)) return true;
  if (first.length > 2 && local.includes(first)) return true;
  // initials + last: jsmith, j.smith
  if (
    last.length > 2 &&
    (local.startsWith(first[0] + last) ||
      local.startsWith(first[0] + "." + last) ||
      local.includes(first[0] + last))
  ) {
    return true;
  }
  return false;
}

const EMAIL_RE = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/gi;

/** Soft de-obfuscation for page text — keep spaces so words don't glue into fake locals. */
export function deobfuscatePageText(pageText: string): string {
  const tld =
    "(?:edu|com|org|net|gov|io|ch|de|ca|uk|jp|kr|in|sg|cn|hk|nz|il|au|ac\\.uk|edu\\.au|ac\\.jp|ac\\.kr|ac\\.in|edu\\.sg|edu\\.cn|edu\\.hk|ac\\.nz|ac\\.il)";
  return (pageText || "")
    .replace(/\[\s*at\s*\]|\(\s*at\s*\)/gi, "@")
    .replace(/\[\s*dot\s*\]|\(\s*dot\s*\)/gi, ".")
    // name at dept dot school dot edu
    .replace(
      new RegExp(
        `\\b([a-z0-9._+-]+)\\s+at\\s+([a-z0-9-]+)\\s+dot\\s+([a-z0-9.-]+)\\s+dot\\s+(${tld})\\b`,
        "gi"
      ),
      "$1@$2.$3.$4"
    )
    // name at school dot edu
    .replace(
      new RegExp(
        `\\b([a-z0-9._+-]+)\\s+at\\s+([a-z0-9.-]+)\\s+dot\\s+(${tld})\\b`,
        "gi"
      ),
      "$1@$2.$3"
    )
    // name at domain.tld — skip if already contains @
    .replace(
      new RegExp(
        `\\b([a-z0-9._+-]+)\\s+at\\s+([a-z0-9.-]+\\.${tld})\\b`,
        "gi"
      ),
      "$1@$2"
    );
}

export function harvestEmailsFromText(pageText: string): string[] {
  const original = pageText || "";
  const soft = deobfuscatePageText(original);
  const raw = [
    ...(original.match(EMAIL_RE) || []),
    ...(soft.match(EMAIL_RE) || []),
  ];
  return Array.from(
    new Set(raw.map((e) => unscrambleEmail(e).toLowerCase()).filter(Boolean))
  ).filter((e) => !isJunkFacultyEmail(e) && e.includes("."));
}

export function pageMentionsName(pageText: string, name: string): boolean {
  const text = (pageText || "").toLowerCase();
  const tokens = nameTokens(name);
  if (tokens.length === 0) return false;
  const last = tokens[tokens.length - 1];
  if (last.length > 2 && text.includes(last)) {
    if (tokens.length === 1) return true;
    // Require first or another token too for multi-part names
    return tokens.slice(0, -1).some((t) => t.length > 1 && text.includes(t));
  }
  return false;
}

export function emailFoundInPage(email: string, pageText: string): boolean {
  const target = unscrambleEmail(email).toLowerCase();
  if (!target) return false;
  return harvestEmailsFromText(pageText).some((e) => e === target);
}

export interface EmailScoreInput {
  email: string;
  name: string;
  university?: string | null;
  pageText?: string;
  homepageUrl?: string | null;
}

export interface EmailScoreResult {
  score: number;
  reasons: string[];
  foundInPage: boolean;
  domainMatch: boolean;
  nameMatch: boolean;
}

/** Threshold for treating an email as verified (evidence-based). */
export const EMAIL_VERIFY_THRESHOLD = 60;

export function scoreEmailCandidate(input: EmailScoreInput): EmailScoreResult {
  const email = unscrambleEmail(input.email || "").toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  if (!email || isJunkFacultyEmail(email)) {
    return {
      score: 0,
      reasons: ["junk_or_invalid"],
      foundInPage: false,
      domainMatch: false,
      nameMatch: false,
    };
  }

  const foundInPage = emailFoundInPage(email, input.pageText || "");
  if (foundInPage) {
    score += 40;
    reasons.push("found_in_page");
  } else {
    reasons.push("not_in_page");
  }

  const allowed = domainsForUniversity(input.university, input.homepageUrl);
  const domainMatch = emailMatchesUniversityDomains(email, allowed);
  const domain = emailDomain(email);
  if (domainMatch) {
    score += 30;
    reasons.push("domain_match");
  } else if (isInstitutionalDomain(domain)) {
    score += 10;
    reasons.push("institutional_tld");
  } else {
    reasons.push("domain_mismatch");
  }

  const nameMatch = nameMatchesLocalPart(input.name, email);
  if (nameMatch) {
    score += 25;
    reasons.push("name_in_local");
  } else if (/\d{3,}/.test(email.split("@")[0] || "")) {
    score -= 15;
    reasons.push("numeric_netid");
  }

  // Strong evidence bonus
  if (foundInPage && (domainMatch || nameMatch)) {
    score += 10;
    reasons.push("strong_evidence");
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
    foundInPage,
    domainMatch,
    nameMatch,
  };
}

export function pickBestEmailFromPage(opts: {
  pageText: string;
  name: string;
  university?: string | null;
  homepageUrl?: string | null;
}): { email: string; score: EmailScoreResult } | null {
  const candidates = harvestEmailsFromText(opts.pageText);
  let best: { email: string; score: EmailScoreResult } | null = null;
  for (const email of candidates) {
    const scored = scoreEmailCandidate({
      email,
      name: opts.name,
      university: opts.university,
      pageText: opts.pageText,
      homepageUrl: opts.homepageUrl,
    });
    if (!best || scored.score > best.score.score) {
      best = { email, score: scored };
    }
  }
  if (!best || best.score.score < EMAIL_VERIFY_THRESHOLD) return null;
  // Must be on page to verify
  if (!best.score.foundInPage) return null;
  return best;
}

export interface VerifyResult {
  primaryEmail: string;
  ccEmails: string[];
  verified: boolean;
  reasoning: string;
}

/**
 * Legacy Exa mashup audit — evidence-gated. Prefer resolveFacultyEmail.
 */
export async function verifyFacultyEmail(
  profName: string,
  university: string,
  currentEmail = "",
  homepageUrl?: string | null
): Promise<VerifyResult> {
  console.log(`[EmailVerifier] Audit for: ${profName} (${university})...`);

  const pagesText: string[] = [];
  try {
    const exa = new ExaClient(process.env.EXA_API_KEY || "");
    const query = `"${profName}" "${university}" email contact homepage faculty directory`;
    const textResult = await exa.searchWeb(query);
    if (textResult && typeof textResult === "string" && textResult.length > 50) {
      pagesText.push(textResult);
    }
  } catch (err) {
    console.warn(
      `[EmailVerifier] Search warning for ${profName}:`,
      err instanceof Error ? err.message : err
    );
  }

  if (pagesText.length === 0) {
    const scored = scoreEmailCandidate({
      email: currentEmail,
      name: profName,
      university,
      homepageUrl,
    });
    return {
      primaryEmail: currentEmail,
      ccEmails: [],
      verified: false,
      reasoning: `No web text retrieved. Score=${scored.score}`,
    };
  }

  const combinedText = pagesText.join("\n\n");
  const fromPage = pickBestEmailFromPage({
    pageText: combinedText,
    name: profName,
    university,
    homepageUrl,
  });

  if (fromPage) {
    return {
      primaryEmail: fromPage.email,
      ccEmails: [],
      verified: true,
      reasoning: `Picked from search text: ${fromPage.score.reasons.join(", ")}`,
    };
  }

  // Optional LLM only to choose among page candidates — never invent
  const candidates = harvestEmailsFromText(combinedText);
  if (candidates.length === 0) {
    return {
      primaryEmail: "",
      ccEmails: [],
      verified: false,
      reasoning: "No emails found in retrieved pages.",
    };
  }

  try {
    const { llmConfigured, completePrompt } = await import(
      "@/services/llm_client"
    );
    if (!llmConfigured()) {
      const scoredCurrent = scoreEmailCandidate({
        email: currentEmail,
        name: profName,
        university,
        pageText: combinedText,
        homepageUrl,
      });
      const fallback =
        scoredCurrent.foundInPage &&
        scoredCurrent.score >= EMAIL_VERIFY_THRESHOLD
          ? currentEmail
          : candidates[0];
      const scored = scoreEmailCandidate({
        email: fallback,
        name: profName,
        university,
        pageText: combinedText,
        homepageUrl,
      });
      return {
        primaryEmail: scored.foundInPage ? fallback : "",
        ccEmails: [],
        verified: scored.score >= EMAIL_VERIFY_THRESHOLD && scored.foundInPage,
        reasoning: scored.reasons.join(", "),
      };
    }

    const prompt = `Pick primary faculty email for ${profName} at ${university} from CANDIDATES ONLY. Never invent.
CANDIDATES:
${candidates.slice(0, 12).join("\n")}
PAGE:
${combinedText.substring(0, 2500)}
Return ONLY JSON: {"valid":true,"primaryEmail":"one of candidates","reasoning":"..."}`;

    let content = (
      (await completePrompt({ user: prompt, task: "extract" })) || ""
    ).trim();
    if (content.startsWith("```")) {
      content = content.replace(/```json/g, "").replace(/```/g, "").trim();
    }
    const match = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : content) as {
      valid?: boolean;
      primaryEmail?: string;
      reasoning?: string;
    };

    const primary = unscrambleEmail(parsed.primaryEmail || "").toLowerCase();
    const inCandidates = candidates.includes(primary);
    if (parsed.valid && primary && inCandidates) {
      const scored = scoreEmailCandidate({
        email: primary,
        name: profName,
        university,
        pageText: combinedText,
        homepageUrl,
      });
      return {
        primaryEmail: primary,
        ccEmails: [],
        verified: scored.score >= EMAIL_VERIFY_THRESHOLD && scored.foundInPage,
        reasoning: parsed.reasoning || scored.reasons.join(", "),
      };
    }
  } catch (err) {
    console.warn(
      `[EmailVerifier] Audit failed for ${profName}:`,
      err instanceof Error ? err.message : err
    );
  }

  return {
    primaryEmail: "",
    ccEmails: [],
    verified: false,
    reasoning: "Could not evidence-verify an email from sources.",
  };
}
