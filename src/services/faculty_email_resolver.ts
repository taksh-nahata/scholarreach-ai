/**
 * Human-style faculty email resolution (FREE-first, paid last):
 * 1) Hint URL free fetch
 * 2) OpenAlex / DDG / Wikipedia directory hits → personal/lab
 * 3) Tavily only if free empty; Firecrawl/Exa only if free fetch thin
 * Never invent emails — only harvest from confirmed page text.
 */
import {
  domainsForUniversity,
  hostFromUrl,
  parentDomain,
} from "@/lib/university_email_domains";
import type { SearchHit } from "./tavily_client";
import {
  pageMentionsName,
  pickBestEmailFromPage,
  scoreEmailCandidate,
  EMAIL_VERIFY_THRESHOLD,
} from "./faculty_email_verifier";
import {
  loadPageTextRedundant,
  searchDirectoryRedundant,
  searchPersonalRedundant,
} from "./faculty_search";

export interface ResolveEmailResult {
  primaryEmail: string;
  sourceUrl: string | null;
  verified: boolean;
  reasoning: string;
  stage: "directory" | "personal" | "none";
}

const DIRECTORY_PATH_HINTS =
  /\/(faculty|people|person|directory|profile|profiles|staff|our-people|academics)\b/i;
const PERSONAL_PATH_HINTS =
  /\/(~|people\/|users\/|labs?\/|research|group|homepage|home)\b/i;
const BAD_HOSTS =
  /scholar\.google|linkedin\.com|twitter\.com|x\.com|facebook\.com|youtube\.com|wikipedia\.org|researchgate\.net|semanticscholar\.org/i;

function rankDirectoryHits(
  hits: SearchHit[],
  university: string
): SearchHit[] {
  const allowed = domainsForUniversity(university);
  const scored = hits
    .filter((h) => h.url && !BAD_HOSTS.test(h.url))
    .map((h) => {
      let s = 0;
      const host = hostFromUrl(h.url);
      const parent = parentDomain(host);
      if (
        allowed.some(
          (d) =>
            host === d || host.endsWith(`.${d}`) || d.endsWith(`.${host}`)
        )
      ) {
        s += 50;
      } else if (
        allowed.some((d) => parent === d || parent.endsWith(`.${d}`))
      ) {
        s += 40;
      }
      if (DIRECTORY_PATH_HINTS.test(h.url)) s += 25;
      if (/edu$|ac\.|edu\./i.test(host)) s += 10;
      if (PERSONAL_PATH_HINTS.test(h.url) && !DIRECTORY_PATH_HINTS.test(h.url))
        s -= 5;
      return { hit: h, s };
    })
    .sort((a, b) => b.s - a.s);
  return scored.map((x) => x.hit);
}

function rankPersonalHits(
  hits: SearchHit[],
  university: string,
  name: string
): SearchHit[] {
  const allowed = domainsForUniversity(university);
  const tokens = name
    .toLowerCase()
    .replace(/^dr\.?\s*/i, "")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const scored = hits
    .filter((h) => h.url && !BAD_HOSTS.test(h.url))
    .map((h) => {
      let s = 0;
      const host = hostFromUrl(h.url);
      const urlLower = h.url.toLowerCase();
      if (allowed.some((d) => host === d || host.endsWith(`.${d}`))) s += 30;
      if (DIRECTORY_PATH_HINTS.test(h.url) && !PERSONAL_PATH_HINTS.test(h.url)) {
        s -= 20;
      }
      if (PERSONAL_PATH_HINTS.test(h.url)) s += 20;
      if (tokens.some((t) => urlLower.includes(t))) s += 25;
      if (/github\.io|wordpress|sites\.google|notion\.site/i.test(host)) s += 15;
      return { hit: h, s };
    })
    .sort((a, b) => b.s - a.s);
  return scored.map((x) => x.hit);
}

function tryExtractFromPage(
  name: string,
  university: string,
  url: string,
  pageText: string
): ResolveEmailResult | null {
  if (!pageMentionsName(pageText, name)) {
    return null;
  }
  const best = pickBestEmailFromPage({
    pageText,
    name,
    university,
    homepageUrl: url,
  });
  if (!best) return null;
  return {
    primaryEmail: best.email,
    sourceUrl: url,
    verified:
      best.score.score >= EMAIL_VERIFY_THRESHOLD && best.score.foundInPage,
    reasoning: `Found on page (${best.score.reasons.join(", ")})`,
    stage: "directory",
  };
}

async function resolveFromHits(
  userId: string,
  name: string,
  university: string,
  hits: SearchHit[],
  stage: "directory" | "personal",
  maxPages = 3
): Promise<ResolveEmailResult | null> {
  const batch = hits.slice(0, maxPages);
  // Parallel page loads (Firecrawl/Tavily-backed) — biggest latency win
  const texts = await Promise.all(
    batch.map((hit) => loadPageTextRedundant(userId, hit))
  );

  let identityUrl: string | null = null;
  for (let i = 0; i < batch.length; i++) {
    const hit = batch[i];
    const text = texts[i];
    if (!text || text.length < 40) continue;

    if (!pageMentionsName(text, name)) {
      console.log(
        `[EmailResolver] Skip ${hit.url} — name not confirmed on page`
      );
      continue;
    }
    if (!identityUrl) identityUrl = hit.url;

    const best = pickBestEmailFromPage({
      pageText: text,
      name,
      university,
      homepageUrl: hit.url,
    });
    if (best) {
      return {
        primaryEmail: best.email,
        sourceUrl: hit.url,
        verified: true,
        reasoning: `${stage}: ${best.score.reasons.join(", ")} @ ${hit.url}`,
        stage,
      };
    }
    console.log(
      `[EmailResolver] Identity OK on ${hit.url} but no strong email`
    );
  }
  if (identityUrl) {
    return {
      primaryEmail: "",
      sourceUrl: identityUrl,
      verified: false,
      reasoning: `${stage}: identity confirmed, no evidenced email`,
      stage,
    };
  }
  return null;
}

export async function resolveFacultyEmail(opts: {
  userId: string;
  name: string;
  university: string;
  hintUrl?: string | null;
}): Promise<ResolveEmailResult> {
  const { userId, name, university } = opts;
  console.log(`[EmailResolver] Resolve ${name} @ ${university}`);

  if (opts.hintUrl) {
    const hintHit: SearchHit = {
      title: name,
      url: opts.hintUrl,
      snippet: "",
    };
    const text = await loadPageTextRedundant(userId, hintHit);
    if (text.length >= 40) {
      const fromHint = tryExtractFromPage(name, university, opts.hintUrl, text);
      if (fromHint?.verified) {
        return { ...fromHint, stage: "directory" };
      }
    }
  }

  const directoryHits = await searchDirectoryRedundant(
    userId,
    name,
    university,
    6
  );
  const rankedDir = rankDirectoryHits(directoryHits, university);
  const fromDir = await resolveFromHits(
    userId,
    name,
    university,
    rankedDir,
    "directory",
    3
  );
  if (fromDir?.verified) return fromDir;

  const personalHits = await searchPersonalRedundant(
    userId,
    name,
    university,
    6
  );
  const rankedPers = rankPersonalHits(personalHits, university, name);
  const fromPers = await resolveFromHits(
    userId,
    name,
    university,
    rankedPers,
    "personal",
    3
  );
  if (fromPers?.verified) return fromPers;

  const bestUrl =
    fromDir?.sourceUrl ||
    fromPers?.sourceUrl ||
    rankedDir[0]?.url ||
    rankedPers[0]?.url ||
    opts.hintUrl ||
    null;

  return {
    primaryEmail: "",
    sourceUrl: bestUrl,
    verified: false,
    reasoning:
      "No evidenced email on directory or personal/lab pages (free+paid). Left empty rather than guess.",
    stage: "none",
  };
}

/** Re-score a stored email against optional page text. Never invent; keep plausible faculty emails. */
export function auditStoredEmail(opts: {
  email: string | null | undefined;
  name: string;
  university: string;
  homepageUrl?: string | null;
  pageText?: string;
}): { keep: boolean; email: string | null; verified: boolean; notes: string } {
  if (!opts.email) {
    return { keep: false, email: null, verified: false, notes: "missing" };
  }
  const scored = scoreEmailCandidate({
    email: opts.email,
    name: opts.name,
    university: opts.university,
    homepageUrl: opts.homepageUrl,
    pageText: opts.pageText || "",
  });

  const okFromPage =
    scored.foundInPage && scored.score >= EMAIL_VERIFY_THRESHOLD;
  const okWithoutPage =
    scored.nameMatch &&
    (scored.domainMatch ||
      scored.reasons.includes("institutional_tld")) &&
    !scored.reasons.includes("junk_or_invalid");

  if (okFromPage || okWithoutPage) {
    return {
      keep: true,
      email: opts.email.toLowerCase(),
      verified: true,
      notes: scored.reasons.join(", "),
    };
  }

  if (!scored.reasons.includes("junk_or_invalid") && scored.score >= 20) {
    return {
      keep: true,
      email: opts.email.toLowerCase(),
      verified: false,
      notes: `Kept unverified (${scored.reasons.join(", ")})`,
    };
  }

  return {
    keep: false,
    email: null,
    verified: false,
    notes: `Weak email (${scored.reasons.join(", ")})`,
  };
}
