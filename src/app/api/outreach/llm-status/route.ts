import { NextResponse } from "next/server";
import { withAuthUser } from "@/lib/api-auth";
import { llmConfigured, llmProviderStatus } from "@/services/llm_client";

/** Which LLM providers are configured (no secrets). */
export async function GET() {
  return withAuthUser(async () => {
    return NextResponse.json({
      configured: llmConfigured(),
      chains: llmProviderStatus(),
      note: "Failover order: Groq → OpenRouter → Mistral → Gemini → Lightning → Provocative. Add API keys in Vercel env.",
    });
  });
}
