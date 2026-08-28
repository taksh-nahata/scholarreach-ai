import { fetchPageText } from "@/services/page_fetch";

export type ResearchedLink = {
  url: string;
  title: string | null;
  description: string | null;
  ok: boolean;
};

const UA =
  process.env.SEARCH_USER_AGENT ||
  "ScholarReachBot/1.0 (+https://scholarreach-ai.vercel.app; research outreach)";

async function fetchHtml(url: string, timeoutMs = 10_000): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    clearTimeout(t);
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

function metaContent(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const m = html.match(re);
  return m?.[1]?.trim() || null;
}

export async function researchLink(url: string): Promise<ResearchedLink> {
  if (!/^https?:\/\//i.test(url)) {
    return { url, title: null, description: null, ok: false };
  }

  const html = await fetchHtml(url);
  if (html) {
    const title =
      metaContent(html, "og:title") ||
      metaContent(html, "twitter:title") ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
      null;
    const description =
      metaContent(html, "og:description") ||
      metaContent(html, "description") ||
      null;
    if (title || description) {
      return { url, title, description, ok: true };
    }
  }

  const text = await fetchPageText(url, { maxChars: 1200, timeoutMs: 10_000 });
  if (!text) {
    let host = url;
    try {
      host = new URL(url).hostname;
    } catch {
      /* ignore */
    }
    return { url, title: host, description: null, ok: false };
  }

  const snippet = text.slice(0, 280).trim();
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    /* ignore */
  }

  return {
    url,
    title: host,
    description: snippet,
    ok: true,
  };
}

export async function researchLinks(
  urls: string[],
  limit = 4
): Promise<ResearchedLink[]> {
  const out: ResearchedLink[] = [];
  for (const url of urls.slice(0, limit)) {
    out.push(await researchLink(url));
  }
  return out;
}
