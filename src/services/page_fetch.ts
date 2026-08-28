/**
 * Free HTML fetch — no Firecrawl. Strips tags for email/name harvest.
 */
const UA =
  process.env.SEARCH_USER_AGENT ||
  "ScholarReachBot/1.0 (+https://scholarreach-ai.vercel.app; research outreach)";

export async function fetchPageText(
  url: string,
  opts?: { maxChars?: number; timeoutMs?: number }
): Promise<string> {
  if (!url || !/^https?:\/\//i.test(url)) return "";
  const maxChars = opts?.maxChars ?? 80_000;
  const timeoutMs = opts?.timeoutMs ?? 8_000;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    clearTimeout(t);
    if (!res.ok) return "";
    const ctype = res.headers.get("content-type") || "";
    if (
      ctype &&
      !/html|xml|text|json|markdown/i.test(ctype) &&
      !ctype.includes("octet-stream")
    ) {
      return "";
    }
    const raw = await res.text();
    return htmlToText(raw).slice(0, maxChars);
  } catch (err) {
    console.warn(
      `[PageFetch] ${url}:`,
      err instanceof Error ? err.message : err
    );
    return "";
  }
}

export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#64;/gi, "@")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}
