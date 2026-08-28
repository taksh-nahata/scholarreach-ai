const FIRECRAWL_TIMEOUT_MS = Number(
  process.env.FIRECRAWL_TIMEOUT_MS || 15_000
);

export class FirecrawlClient {
  constructor(private apiKey: string) {}

  get configured() {
    return Boolean(this.apiKey);
  }

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
          timeout: Math.floor(FIRECRAWL_TIMEOUT_MS / 1000),
        }),
        signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Firecrawl API Error: ${response.status}`);
      const data = (await response.json()) as {
        success?: boolean;
        data?: { markdown?: string };
      };
      if (data?.success && data?.data?.markdown) {
        console.log(
          `[Firecrawl] ok url=${url.slice(0, 80)} chars=${data.data.markdown.length}`
        );
        return data.data.markdown;
      }
      return "";
    } catch (err) {
      console.error(`[Firecrawl] Failed:`, err instanceof Error ? err.message : err);
      return "";
    }
  }
}

export const firecrawlClient = new FirecrawlClient(
  process.env.FIRECRAWL_API_KEY || ""
);
