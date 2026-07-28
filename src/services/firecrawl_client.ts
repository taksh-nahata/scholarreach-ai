export class FirecrawlClient {
  constructor(private apiKey: string) {}

  async scrapeUrl(url: string): Promise<string> {
    if (!this.apiKey) return "";
    try {
      const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: true,
        }),
      });
      if (!response.ok) throw new Error(`Firecrawl API Error: ${response.status}`);
      const data = (await response.json()) as {
        success?: boolean;
        data?: { markdown?: string };
      };
      if (data?.success && data?.data?.markdown) return data.data.markdown;
      return "";
    } catch (err) {
      console.error(`[Firecrawl] Failed:`, err instanceof Error ? err.message : err);
      return "";
    }
  }
}

export const firecrawlClient = new FirecrawlClient(process.env.FIRECRAWL_API_KEY || "");
