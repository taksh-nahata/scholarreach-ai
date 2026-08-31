/** When true: skip paid search + LLM mining; prefer OpenAlex/templates only. */
export function freeFirstMode(): boolean {
  return (process.env.FREE_FIRST_MODE || "true").toLowerCase() === "true";
}

export function llmEmailDraftsEnabled(): boolean {
  if (freeFirstMode()) return false;
  return (process.env.USE_LLM_EMAIL_DRAFTS || "false").toLowerCase() === "true";
}
