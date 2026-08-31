/** When true: never call paid search/scrape APIs (OpenAlex + free fetch only). */
export function freeFirstMode(): boolean {
  return (process.env.FREE_FIRST_MODE || "false").toLowerCase() === "true";
}

export function llmEmailDraftsEnabled(): boolean {
  if (freeFirstMode()) return false;
  return (process.env.USE_LLM_EMAIL_DRAFTS || "false").toLowerCase() === "true";
}
