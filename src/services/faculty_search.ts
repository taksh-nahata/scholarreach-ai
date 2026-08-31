/**
 * Redundant faculty search facade:
 *   FREE first → paid APIs only when free is thin (budget/errors → free fallback)
 *   Page text: free fetch → Firecrawl → Exa (each optional)
 */
import type { SearchHit } from "./tavily_client";
import { tavilyClient } from "./tavily_client";
import { firecrawlClient } from "./firecrawl_client";
import { exaClient } from "./exa_client";
import { tryPaidApi } from "@/lib/paid_api_fallback";
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

/** Paid search only when free results are thin. */
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
  const paid = await tryPaidApi(userId, "tavily", "Tavily search", run, (h) =>
    Array.isArray(h) && h.length > 0
  );
  return paid || [];
}

/** Free search always runs; paid Tavily merges in only when free is thin or forced. */
async function searchWithTavilyBackup(opts: {
  userId: string;
  free: () => Promise<SearchHit[]>;
  tavily: () => Promise<SearchHit[]>;
  forceTavily?: boolean;
  limit: number;
}): Promise<SearchHit[]> {
  const freeHits = await opts.free();
  const paidHits = tavilyClient.configured
    ? await maybeTavily(
        opts.userId,
        freeHits,
        opts.tavily,
        Boolean(opts.forceTavily)
      )
    : [];

  if (paidHits.length) {
    console.log(
      `[Search] free=${freeHits.length} + tavily=${paidHits.length}`
    );
  } else if (freeHits.length) {
    console.log(`[Search] free-only=${freeHits.length}`);
  }

  return uniqHits([...freeHits, ...paidHits]).slice(0, opts.limit);
}

/** Load page text: free fetch → Firecrawl → Exa (each skipped on budget/error). */
export async function loadPageTextRedundant(
  userId: string,
  hit: SearchHit
): Promise<string> {
  let text = hit.snippet || "";
  if (text.length >= 500) return text;

  if (BAD_SCRAPE_HOSTS.test(hit.url || "")) {
    const free = await fetchPageText(hit.url);
    return free.length > text.length ? free : text;
  }

  const free = await fetchPageText(hit.url);
  if (free.length > text.length) text = free;
  if (text.length >= 400) return text;

  if (firecrawlClient.configured) {
    const md = await tryPaidApi(
      userId,
      "firecrawl",
      `Firecrawl ${hit.url?.slice(0, 60)}`,
      () => firecrawlClient.scrapeUrl(hit.url),
      (s) => typeof s === "string" && s.length > 50
    );
    if (md && md.length > text.length) text = md;
  }
  if (text.length >= 200) return text;

  if (exaClient.configured) {
    const exaText = await tryPaidApi(
      userId,
      "exa",
      `Exa page ${safeHost(hit.url)}`,
      () =>
        exaClient.searchWeb(
          `site:${safeHost(hit.url)} ${hit.title || ""}`.trim()
        ),
      (s) =>
        typeof s === "string" &&
        s.length > 50 &&
        !s.startsWith("No results")
    );
    if (exaText) {
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
    forceTavily: opts?.forceTavily ?? false,
    limit,
  });
}

/** Paper title: OpenAlex → S2 → Crossref → Exa last (optional). */
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

  if (exaClient.configured) {
    const exa = await tryPaidApi(
      userId,
      "exa",
      "Exa recent paper",
      () => exaClient.findRecentPaper(name, university, researchFocus || ""),
      (t) => typeof t === "string" && t.length > 8
    );
    if (exa) return exa;
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
    { forceTavily: false }
  );
  return fromOA;
}

export type { OpenAlexFaculty };
