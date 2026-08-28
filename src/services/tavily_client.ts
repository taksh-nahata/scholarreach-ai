export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
};

const TAVILY_TIMEOUT_MS = Number(process.env.TAVILY_TIMEOUT_MS || 12_000);

/** Process-local cooldown when plan limit (432/433) is hit. */
let disabledUntil = 0;

export class TavilyClient {
  constructor(private apiKey: string) {}

  get configured() {
    return Boolean(this.apiKey) && Date.now() >= disabledUntil;
  }

  private async search(query: string, limit = 5): Promise<SearchHit[]> {
    if (!this.apiKey) return [];
    if (Date.now() < disabledUntil) {
      console.warn("[Tavily] skipped — plan limit cooldown active");
      return [];
    }
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          query,
          // basic is much faster than advanced; fine for faculty URL discovery
          search_depth: process.env.TAVILY_SEARCH_DEPTH || "basic",
          max_results: limit,
          include_answer: false,
          // also pass key in body for older gateway compatibility
          api_key: this.apiKey,
        }),
        signal: AbortSignal.timeout(TAVILY_TIMEOUT_MS),
      });
      if (response.status === 432 || response.status === 433) {
        disabledUntil = Date.now() + 60 * 60 * 1000;
        const body = await response.text().catch(() => "");
        console.error(
          `[Tavily] plan limit ${response.status} — cooling down 1h. ${body.slice(0, 120)}`
        );
        return [];
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Tavily API Error: ${response.status} ${body.slice(0, 100)}`);
      }
      const data = (await response.json()) as {
        results?: Array<{ title: string; url: string; content?: string }>;
      };
      const hits = (data.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content || "",
      }));
      console.log(
        `[Tavily] ok query="${query.slice(0, 60)}" hits=${hits.length}`
      );
      return hits;
    } catch (err) {
      console.error(`[Tavily] Failed:`, err instanceof Error ? err.message : err);
      return [];
    }
  }

  /** Discover faculty pages by topic (not email resolution). */
  async searchFacultyPages(university: string, topic: string, limit = 3) {
    const query = `"${topic}" (professor OR "principal investigator" OR faculty) "${university}" (profile OR homepage OR lab)`;
    return this.search(query, limit);
  }

  /** Official school directory / people page for a named professor. */
  async searchFacultyDirectory(name: string, university: string, limit = 5) {
    const query = `"${name}" "${university}" (directory OR faculty OR profile OR people OR "faculty profile")`;
    return this.search(query, limit);
  }

  /** Personal homepage or lab site when directory has no email. */
  async searchPersonalOrLab(name: string, university: string, limit = 5) {
    const query = `"${name}" "${university}" (homepage OR "personal website" OR lab OR "research group" OR "home page") -directory -scholar`;
    return this.search(query, limit);
  }
}

export const tavilyClient = new TavilyClient(process.env.TAVILY_API_KEY || "");
