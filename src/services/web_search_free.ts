/**
 * Free web URL discovery — redundant providers, no paid credits.
 * 1) DuckDuckGo HTML  2) Wikipedia opensearch  3) Bing-less fallbacks fail soft
 */
import type { SearchHit } from "./tavily_client";
import { htmlToText } from "./page_fetch";

const UA =
  process.env.SEARCH_USER_AGENT ||
  "ScholarReachBot/1.0 (+https://scholarreach-ai.vercel.app)";

function uniqHits(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const h of hits) {
    const key = (h.url || "").replace(/#.*$/, "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

/** DuckDuckGo HTML results (free, no key). Soft-fails on datacenter blocks. */
export async function duckDuckGoSearch(
  query: string,
  limit = 8
): Promise<SearchHit[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const hits: SearchHit[] = [];

    // uddg= redirect links
    const re =
      /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && hits.length < limit) {
      let href = m[1];
      const title = htmlToText(m[2] || "").trim();
      try {
        const u = new URL(href, "https://duckduckgo.com");
        const uddg = u.searchParams.get("uddg");
        if (uddg) href = decodeURIComponent(uddg);
      } catch {
        /* keep */
      }
      if (!/^https?:\/\//i.test(href)) continue;
      if (/duckduckgo\.com/i.test(href)) continue;
      hits.push({ title: title || href, url: href, snippet: "" });
    }

    // Fallback: any result links
    if (!hits.length) {
      const re2 = /href="(https?:\/\/[^"]+)"/gi;
      while ((m = re2.exec(html)) && hits.length < limit) {
        const href = m[1];
        if (/duckduckgo\.com|javascript:/i.test(href)) continue;
        hits.push({ title: href, url: href, snippet: "" });
      }
    }
    return uniqHits(hits).slice(0, limit);
  } catch (err) {
    console.warn(`[DDG]`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function wikipediaSearch(
  query: string,
  limit = 3
): Promise<SearchHit[]> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
      query
    )}&limit=${limit}&namespace=0&format=json`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as [string, string[], string[], string[]];
    const titles = data[1] || [];
    const descs = data[2] || [];
    const links = data[3] || [];
    return titles.map((t, i) => ({
      title: t,
      url: links[i] || "",
      snippet: descs[i] || "",
    })).filter((h) => h.url);
  } catch {
    return [];
  }
}

/** Crossref works search — free paper titles / sometimes affiliation. */
export async function crossrefPaperSearch(
  query: string,
  limit = 5
): Promise<Array<{ title: string; year?: number }>> {
  try {
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(
      query
    )}&rows=${limit}&select=title,published-print,published-online,author`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": `ScholarReach/1.0 (mailto:${process.env.OPENALEX_MAILTO || "scholarreach@users.noreply.github.com"})`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      message?: {
        items?: Array<{
          title?: string[];
          "published-print"?: { "date-parts"?: number[][] };
        }>;
      };
    };
    return (data.message?.items || [])
      .map((it) => ({
        title: (it.title || [])[0] || "",
        year: it["published-print"]?.["date-parts"]?.[0]?.[0],
      }))
      .filter((x) => x.title.length > 12);
  } catch {
    return [];
  }
}

export async function freeWebSearch(
  query: string,
  limit = 8
): Promise<SearchHit[]> {
  const [ddg, wiki] = await Promise.all([
    duckDuckGoSearch(query, limit),
    wikipediaSearch(query, 2),
  ]);
  return uniqHits([...ddg, ...wiki]).slice(0, limit);
}

export async function freeFacultyDirectorySearch(
  name: string,
  university: string,
  limit = 6
): Promise<SearchHit[]> {
  const q = `"${name}" "${university}" (faculty OR professor OR directory OR profile OR people)`;
  return freeWebSearch(q, limit);
}

export async function freePersonalOrLabSearch(
  name: string,
  university: string,
  limit = 6
): Promise<SearchHit[]> {
  const q = `"${name}" "${university}" (homepage OR "research group" OR lab OR "personal website")`;
  return freeWebSearch(q, limit);
}

export async function freeFacultyTopicSearch(
  university: string,
  topic: string,
  limit = 5
): Promise<SearchHit[]> {
  const q = `"${topic}" (professor OR faculty) "${university}" (profile OR lab OR homepage)`;
  return freeWebSearch(q, limit);
}
