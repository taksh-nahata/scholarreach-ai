/**
 * Semantic Scholar — free academic API (optional S2_API_KEY raises rate limits).
 */
const BASE = "https://api.semanticscholar.org/graph/v1";

function headers(): HeadersInit {
  const h: Record<string, string> = { Accept: "application/json" };
  if (process.env.S2_API_KEY) h["x-api-key"] = process.env.S2_API_KEY;
  return h;
}

async function s2Get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: headers() });
    if (!res.ok) {
      console.warn(`[S2] ${res.status} ${path}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[S2]`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function findRecentPaperS2(
  name: string,
  university?: string
): Promise<string | null> {
  const bare = name.replace(/^dr\.?\s*/i, "").trim();
  const q = encodeURIComponent(
    university ? `${bare} ${university}` : bare
  );
  const authors = await s2Get<{
    data?: Array<{ authorId: string; name: string }>;
  }>(`/author/search?query=${q}&limit=5`);
  const author = authors?.data?.[0];
  if (!author?.authorId) return null;

  const papers = await s2Get<{
    data?: Array<{ title?: string; year?: number }>;
  }>(
    `/author/${author.authorId}/papers?fields=title,year&limit=5&sort=year:desc`
  );
  const hit = (papers?.data || []).find((p) => (p.title || "").length > 12);
  return hit?.title || null;
}
