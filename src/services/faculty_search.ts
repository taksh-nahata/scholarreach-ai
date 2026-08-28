/**
 * Redundant faculty search facade:
 *   FREE + Tavily in parallel (when budget allows)
 *   Page text: free fetch → Firecrawl → Exa (with timeouts + host filters)
 */
import type { SearchHit } from "./tavily_client";
import { tavilyClient } from "./tavily_client";
import { firecrawlClient } from "./firecrawl_client";
import { exaClient } from "./exa_client";
import { tryConsumeApi } from "./api_budget";
import { fetchPageText } from "./page_fetch";
import {
  discoverFacultyAtUniversity,
  findRecentPaperFree,
  findAuthorByName,
  facultyUrlsToHits,
  type OpenAlexFaculty,
} from "./openalex_client";
import { findRecentPaperS2 } from "./semantic_scholar_client";
import {
  freeFacultyDirectorySearch,
  freePersonalOrLabSearch,
  freeFacultyTopicSearch,
  crossrefPaperSearch,
} from "./web_search_free";

const BAD_SCRAPE_HOSTS =
  /scholar\.google|linkedin\.com|twitter\.com|x\.com|facebook\.com|youtube\.com|wikipedia\.org|researchgate\.net|semanticscholar\.org|amazon\.com|reddit\.com/i;

const DIRECTORY_HINT =
  /\/(faculty|people|person|directory|profile|profiles|staff|our-people|academics)\b/i;

function uniqHits(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const h of hits) {
    const key = (h.url || "").replace(/#.*$/, "").toLowerCase();
    if (!key.startsWith("http") || seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

function qualityHitCount(hits: SearchHit[]): number {
  return hits.filter((h) => {
    if (!h.url || BAD_SCRAPE_HOSTS.test(h.url)) return false;
    try {
      const host = new URL(h.url).hostname.toLowerCase();
      if (/\.edu$|\.ac\.|edu\./i.test(host)) return true;
      if (DIRECTORY_HINT.test(h.url)) return true;
      if ((h.snippet || "").length >= 120) return true;
    } catch {
      return false;
    }
    return false;
  }).length;
}

/** Use Tavily when free results are thin/junk — or always if force=true. */
function needsPaidSearch(freeHits: SearchHit[], force = false): boolean {
  if (force) return true;
  if (freeHits.length < 2) return true;
  return qualityHitCount(freeHits) < 1;
}

async function maybeTavily(
  userId: string,
  freeHits: SearchHit[],
  run: () => Promise<SearchHit[]>,
  force = false
): Promise<SearchHit[]> {
  if (!tavilyClient.configured) return [];
  if (!needsPaidSearch(freeHits, force)) {
    console.log(
      `[Search] skip Tavily — free quality hits=${qualityHitCount(freeHits)}/${freeHits.length}`
    );
    return [];
  }
  // Call first; only burn budget on non-empty success (plan-limit returns [])
  const paid = await run();
  if (!paid.length) return [];
  if (!(await tryConsumeApi(userId, "tavily", 1))) {
    console.warn("[Search] Tavily hits discarded — daily budget exhausted");
    return [];
  }
  return paid;
}

/**
 * Run free + Tavily in parallel when Tavily is likely needed.
 * For topic mining (`forceTavily`), always attempt Tavily alongside free.
 */
async function searchWithTavilyBackup(opts: {
  userId: string;
  free: () => Promise<SearchHit[]>;
  tavily: () => Promise<SearchHit[]>;
  forceTavily?: boolean;
  limit: number;
}): Promise<SearchHit[]> {
  const force = Boolean(opts.forceTavily);

  if (!tavilyClient.configured) {
    return uniqHits(await opts.free()).slice(0, opts.limit);
  }

  // Parallel path: start free immediately; start Tavily if force or after peeking free is slow —
  // We kick both when force, otherwise free first then Tavily if needed (still fast with basic depth).
  if (force) {
    const freeP = opts.free();
    const paidP = (async () => {
      if (!tavilyClient.configured) return [] as SearchHit[];
      const paid = await opts.tavily();
      if (!paid.length) return [];
      if (!(await tryConsumeApi(opts.userId, "tavily", 1))) return [];
      return paid;
    })();
    const [freeHits, paidHits] = await Promise.all([freeP, paidP]);
    console.log(
      `[Search] parallel free=${freeHits.length} tavily=${paidHits.length} force=1`
    );
    return uniqHits([...freeHits, ...paidHits]).slice(0, opts.limit);
  }

  const freeHits = await opts.free();
  const paidHits = await maybeTavily(opts.userId, freeHits, opts.tavily, false);
  if (paidHits.length) {
    console.log(
      `[Search] free=${freeHits.length} + tavily=${paidHits.length}`
    );
  }
  return uniqHits([...freeHits, ...paidHits]).slice(0, opts.limit);
}

/** Load page text: free fetch → Firecrawl → Exa (last). */
export async function loadPageTextRedundant(
  userId: string,
  hit: SearchHit
): Promise<string> {
  let text = hit.snippet || "";
  if (text.length >= 500) return text;

  if (BAD_SCRAPE_HOSTS.test(hit.url || "")) {
    // Don't waste Firecrawl on social/wiki — free fetch only
    const free = await fetchPageText(hit.url);
    return free.length > text.length ? free : text;
  }

  const free = await fetchPageText(hit.url);
  if (free.length > text.length) text = free;
  if (text.length >= 400) return text;

  if (firecrawlClient.configured && (await tryConsumeApi(userId, "firecrawl", 1))) {
    const md = await firecrawlClient.scrapeUrl(hit.url);
    if (md && md.length > text.length) text = md;
  }
  if (text.length >= 200) return text;

  if (exaClient.configured && (await tryConsumeApi(userId, "exa", 1))) {
    const exaText = await exaClient.searchWeb(
      `site:${safeHost(hit.url)} ${hit.title || ""}`.trim()
    );
    if (exaText && exaText.length > 50 && !exaText.startsWith("No results")) {
      text = `${text}\n${exaText}`.trim();
    }
  }
  return text;
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export async function searchDirectoryRedundant(
  userId: string,
  name: string,
  university: string,
  limit = 6
): Promise<SearchHit[]> {
  const authorHits: SearchHit[] = [];
  const author = await findAuthorByName(name, university);
  if (author) authorHits.push(...facultyUrlsToHits(author));

  const web = await searchWithTavilyBackup({
    userId,
    free: () => freeFacultyDirectorySearch(name, university, limit),
    tavily: () => tavilyClient.searchFacultyDirectory(name, university, limit),
    limit,
  });

  return uniqHits([...authorHits, ...web]).slice(0, limit);
}

export async function searchPersonalRedundant(
  userId: string,
  name: string,
  university: string,
  limit = 6
): Promise<SearchHit[]> {
  return searchWithTavilyBackup({
    userId,
    free: () => freePersonalOrLabSearch(name, university, limit),
    tavily: () => tavilyClient.searchPersonalOrLab(name, university, limit),
    limit,
  });
}

export async function searchTopicPagesRedundant(
  userId: string,
  university: string,
  topic: string,
  limit = 4,
  opts?: { forceTavily?: boolean }
): Promise<SearchHit[]> {
  return searchWithTavilyBackup({
    userId,
    free: () => freeFacultyTopicSearch(university, topic, limit),
    tavily: () => tavilyClient.searchFacultyPages(university, topic, limit),
    forceTavily: opts?.forceTavily ?? true, // mining path always backs up with Tavily
    limit,
  });
}

/** Paper title: OpenAlex → S2 → Crossref → Exa last. */
export async function findRecentPaperRedundant(
  userId: string,
  name: string,
  university: string,
  researchFocus?: string | null
): Promise<string | null> {
  const oa = await findRecentPaperFree(
    name,
    university,
    researchFocus || undefined
  );
  if (oa) return oa;

  const s2 = await findRecentPaperS2(name, university);
  if (s2) return s2;

  const cr = await crossrefPaperSearch(
    `${name.replace(/^dr\.?\s*/i, "")} ${researchFocus || university}`,
    5
  );
  if (cr[0]?.title) return cr[0].title;

  if (exaClient.configured && (await tryConsumeApi(userId, "exa", 1))) {
    return exaClient.findRecentPaper(name, university, researchFocus || "");
  }
  return null;
}

export async function discoverFacultyRedundant(opts: {
  userId: string;
  university: string;
  topic: string;
  limit?: number;
}): Promise<OpenAlexFaculty[]> {
  const limit = opts.limit ?? 6;
  const fromOA = await discoverFacultyAtUniversity({
    university: opts.university,
    topic: opts.topic,
    limit,
  });
  if (fromOA.length >= Math.min(3, limit)) return fromOA;

  await searchTopicPagesRedundant(
    opts.userId,
    opts.university,
    opts.topic,
    3,
    { forceTavily: true }
  );
  return fromOA;
}

export type { OpenAlexFaculty };
