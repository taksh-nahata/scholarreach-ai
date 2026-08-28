const EXA_TIMEOUT_MS = Number(process.env.EXA_TIMEOUT_MS || 12_000);

export class ExaClient {
  constructor(private apiKey: string) {}

  get configured() {
    return Boolean(this.apiKey);
  }

  async findRecentPaper(
    professorName: string,
    university: string,
    researchFocus: string
  ) {
    if (!this.apiKey) return null;
    try {
      const query = `Professor ${professorName} ${university} recent research paper publication ${researchFocus}`;
      const response = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          query,
          useAutoprompt: true,
          numResults: 3,
          contents: { text: true },
        }),
        signal: AbortSignal.timeout(EXA_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Exa API Error: ${response.status}`);
      const data = (await response.json()) as {
        results?: Array<{ title?: string }>;
      };
      if (data?.results?.length) {
        for (const res of data.results) {
          if (
            res.title &&
            res.title.length > 15 &&
            !res.title.toLowerCase().includes("home") &&
            !res.title.toLowerCase().includes("profile")
          ) {
            return res.title.trim();
          }
        }
        return data.results[0]?.title?.trim() || null;
      }
      return null;
    } catch (err) {
      console.warn(`[Exa] Failed:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  async searchWeb(query: string): Promise<string> {
    if (!this.apiKey) return "No results found.";
    try {
      const response = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          query,
          useAutoprompt: true,
          numResults: 3,
          contents: { text: true, highlights: { numSentences: 3 } },
        }),
        signal: AbortSignal.timeout(EXA_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Exa API Error: ${response.status}`);
      const data = (await response.json()) as {
        results?: Array<{
          title?: string;
          url?: string;
          text?: string;
          highlights?: string[];
        }>;
      };
      if (!data?.results?.length) return "No results found.";
      let resultString = "";
      data.results.forEach((res, i) => {
        resultString += `[Result ${i + 1}] Title: ${res.title || "Unknown"}\n`;
        resultString += `URL: ${res.url || ""}\n`;
        resultString += `Text: ${(res.text || "").substring(0, 2000)}\n`;
        if (res.highlights?.length)
          resultString += `Highlights: ${res.highlights.join(" | ")}\n`;
        resultString += "\n";
      });
      return resultString;
    } catch (err) {
      console.warn(
        `[Exa] searchWeb failed:`,
        err instanceof Error ? err.message : err
      );
      return "No results found.";
    }
  }
}

export const exaClient = new ExaClient(process.env.EXA_API_KEY || "");
