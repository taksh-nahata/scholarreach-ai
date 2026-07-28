export class TavilyClient {
  constructor(private apiKey: string) {}

  async searchFacultyPages(university: string, topic: string, limit = 3) {
    if (!this.apiKey) return [];
    try {
      const query = `official faculty profile page computer science professor or principal investigator ${topic} ${university}`;
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          query,
          search_depth: "advanced",
          max_results: limit,
          include_answer: false,
        }),
      });
      if (!response.ok) throw new Error(`Tavily API Error: ${response.status}`);
      const data = (await response.json()) as {
        results?: Array<{ title: string; url: string; content?: string }>;
      };
      return (data.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content || "",
      }));
    } catch (err) {
      console.error(`[Tavily] Failed:`, err instanceof Error ? err.message : err);
      return [];
    }
  }
}

export const tavilyClient = new TavilyClient(process.env.TAVILY_API_KEY || "");
