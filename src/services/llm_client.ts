/**
 * Multi-provider LLM client with automatic failover.
 *
 * Order (first configured + healthy wins):
 *   1. Groq
 *   2. OpenRouter
 *   3. Mistral
 *   4. Gemini (OpenAI-compatible endpoint)
 *   5. Novita (OpenAI-compatible)
 *   6. Lightning / any OpenAI-compatible base URL
 *   7. Provocative (legacy)
 *
 * Free-tier Groq limits: https://console.groq.com/docs/rate-limits
 * Novita docs: https://novita.ai/docs/guides/llm-api
 */
export type LlmTask = "draft" | "review" | "extract" | "chat" | "generic";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmCallResult = {
  content: string;
  provider: string;
  model: string;
} | null;

type ProviderConfig = {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Extra headers (OpenRouter prefers HTTP-Referer / X-Title) */
  headers?: Record<string, string>;
  /** Soft spacing between calls for this provider (ms) */
  minIntervalMs?: number;
};

const TASK_LIMITS: Record<
  LlmTask,
  { maxTokens: number; temperature: number; quality: boolean }
> = {
  draft: { maxTokens: 520, temperature: 0.35, quality: true },
  review: { maxTokens: 260, temperature: 0.1, quality: false },
  extract: { maxTokens: 1600, temperature: 0.1, quality: false },
  chat: { maxTokens: 100, temperature: 0.4, quality: false },
  generic: { maxTokens: 360, temperature: 0.2, quality: false },
};

const PROMPT_CHAR_CAPS: Record<LlmTask, number> = {
  draft: 5500,
  review: 3200,
  extract: 12000,
  chat: 2800,
  generic: 4000,
};

const lastCallAt = new Map<string, number>();
let chain: Promise<void> = Promise.resolve();

function env(name: string, fallback = ""): string {
  return (process.env[name] || fallback).trim();
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterSeconds(header: string | null): number {
  if (!header) return 3;
  const n = Number(header);
  if (Number.isFinite(n) && n >= 0) return Math.min(60, Math.max(1, n));
  return 3;
}

function truncateMessages(
  messages: LlmMessage[],
  task: LlmTask
): LlmMessage[] {
  const cap = PROMPT_CHAR_CAPS[task];
  let total = messages.reduce((s, m) => s + m.content.length, 0);
  if (total <= cap) return messages;

  const out = messages.map((m) => ({ ...m }));
  for (let i = out.length - 1; i >= 0 && total > cap; i--) {
    const m = out[i];
    if (m.role === "assistant") continue;
    const overflow = total - cap;
    if (m.content.length <= overflow + 200) continue;
    const keep = Math.max(400, m.content.length - overflow - 40);
    m.content = `${m.content.slice(0, keep)}\n…[truncated]`;
    total = out.reduce((s, x) => s + x.content.length, 0);
  }
  return out;
}

/** Build the failover chain from env — only providers with keys/URLs. */
export function listLlmProviders(task: LlmTask): ProviderConfig[] {
  const quality = TASK_LIMITS[task].quality;
  const out: ProviderConfig[] = [];

  const groqKey = env("GROQ_API_KEY");
  if (groqKey) {
    out.push({
      name: "Groq",
      baseUrl: env("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
      apiKey: groqKey,
      model: quality
        ? env("GROQ_MODEL_QUALITY", env("GROQ_MODEL", "openai/gpt-oss-20b"))
        : env("GROQ_MODEL_FAST", "allam-2-7b"),
      minIntervalMs: Number(env("GROQ_MIN_INTERVAL_MS", "2200")),
    });
  }

  const openRouterKey = env("OPENROUTER_API_KEY");
  if (openRouterKey) {
    out.push({
      name: "OpenRouter",
      baseUrl: env("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
      apiKey: openRouterKey,
      model: quality
        ? env(
            "OPENROUTER_MODEL_QUALITY",
            env("OPENROUTER_MODEL", "meta-llama/llama-3.2-3b-instruct")
          )
        : env(
            "OPENROUTER_MODEL_FAST",
            "meta-llama/llama-3.2-3b-instruct"
          ),
      headers: {
        "HTTP-Referer": env(
          "OPENROUTER_SITE_URL",
          env("NEXT_PUBLIC_LIVE_APP_URL", "https://scholarreach-ai.vercel.app")
        ),
        "X-Title": env("OPENROUTER_APP_NAME", "ScholarReach"),
      },
      minIntervalMs: Number(env("OPENROUTER_MIN_INTERVAL_MS", "1500")),
    });
  }

  const mistralKey = env("MISTRAL_API_KEY");
  if (mistralKey) {
    out.push({
      name: "Mistral",
      baseUrl: env("MISTRAL_BASE_URL", "https://api.mistral.ai/v1"),
      apiKey: mistralKey,
      model: quality
        ? env("MISTRAL_MODEL_QUALITY", env("MISTRAL_MODEL", "mistral-small-latest"))
        : env("MISTRAL_MODEL_FAST", "mistral-small-latest"),
      minIntervalMs: Number(env("MISTRAL_MIN_INTERVAL_MS", "800")),
    });
  }

  // Gemini via Google's OpenAI-compatible endpoint
  const geminiKey = env("GEMINI_API_KEY") || env("GOOGLE_AI_API_KEY");
  if (geminiKey) {
    out.push({
      name: "Gemini",
      baseUrl: env(
        "GEMINI_BASE_URL",
        "https://generativelanguage.googleapis.com/v1beta/openai"
      ),
      apiKey: geminiKey,
      model: quality
        ? env("GEMINI_MODEL_QUALITY", env("GEMINI_MODEL", "gemini-2.5-flash"))
        : env("GEMINI_MODEL_FAST", "gemini-2.5-flash"),
      minIntervalMs: Number(env("GEMINI_MIN_INTERVAL_MS", "800")),
    });
  }

  // Novita — OpenAI-compatible (https://api.novita.ai/openai/v1)
  const novitaKey = env("NOVITA_API_KEY");
  if (novitaKey) {
    out.push({
      name: "Novita",
      baseUrl: env("NOVITA_BASE_URL", "https://api.novita.ai/openai/v1"),
      apiKey: novitaKey,
      model: quality
        ? env(
            "NOVITA_MODEL_QUALITY",
            env("NOVITA_MODEL", "meta-llama/llama-3.1-8b-instruct")
          )
        : env("NOVITA_MODEL_FAST", "meta-llama/llama-3.2-1b-instruct"),
      minIntervalMs: Number(env("NOVITA_MIN_INTERVAL_MS", "600")),
    });
  }

  // Lightning AI LitServe (or any self-hosted OpenAI-compatible GPU endpoint)
  const lightningUrl = env("LIGHTNING_BASE_URL") || env("LLM_COMPAT_BASE_URL");
  const lightningKey =
    env("LIGHTNING_API_KEY") ||
    env("LLM_COMPAT_API_KEY") ||
    "not-needed";
  if (lightningUrl) {
    out.push({
      name: env("LIGHTNING_BASE_URL") ? "Lightning" : "CompatLLM",
      baseUrl: lightningUrl,
      apiKey: lightningKey,
      model: quality
        ? env(
            "LIGHTNING_MODEL_QUALITY",
            env("LIGHTNING_MODEL", env("LLM_COMPAT_MODEL", "default"))
          )
        : env(
            "LIGHTNING_MODEL_FAST",
            env("LIGHTNING_MODEL", env("LLM_COMPAT_MODEL", "default"))
          ),
      minIntervalMs: Number(env("LIGHTNING_MIN_INTERVAL_MS", "500")),
    });
  }

  const provocativeBase = env("PROVOCATIVE_BASE_URL");
  const provocativeKey = env("PROVOCATIVE_API_KEY");
  if (provocativeBase && provocativeKey) {
    out.push({
      name: "Provocative",
      baseUrl: provocativeBase,
      apiKey: provocativeKey,
      model: env("PRIMARY_MODEL", "qwen3.6-35b"),
      minIntervalMs: 500,
    });
  }

  return out;
}

export function llmConfigured(): boolean {
  return listLlmProviders("generic").length > 0;
}

export function llmProviderLabel(task: LlmTask = "draft"): string {
  const providers = listLlmProviders(task);
  if (!providers.length) return "none";
  return providers.map((p) => `${p.name}/${p.model}`).join(" → ");
}

export function llmProviderStatus() {
  return (["draft", "extract", "chat"] as LlmTask[]).map((task) => ({
    task,
    chain: listLlmProviders(task).map((p) => ({
      name: p.name,
      model: p.model,
    })),
  }));
}

async function paceCall(provider: ProviderConfig, estimatedTokens: number) {
  const minGap = provider.minIntervalMs ?? 1000;
  const key = provider.name;
  const waitForGap = async () => {
    const last = lastCallAt.get(key) || 0;
    const elapsed = Date.now() - last;
    if (elapsed < minGap) await sleep(minGap - elapsed);
  };

  const heavy = estimatedTokens > 4000;
  const run = chain.then(async () => {
    await waitForGap();
    if (heavy) await sleep(800);
    lastCallAt.set(key, Date.now());
  });
  chain = run.catch(() => undefined);
  await run;
}

async function postChat(
  provider: ProviderConfig,
  body: Record<string, unknown>
): Promise<Response> {
  return fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
      ...(provider.headers || {}),
    },
    body: JSON.stringify(body),
  });
}

async function tryProvider(
  provider: ProviderConfig,
  messages: LlmMessage[],
  opts: {
    temperature: number;
    maxTokens: number;
    estTotal: number;
  }
): Promise<LlmCallResult> {
  await paceCall(provider, opts.estTotal);

  const payload = {
    model: provider.model,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    messages,
  };

  let res = await postChat(provider, payload);

  if (res.status === 429) {
    const waitSec = parseRetryAfterSeconds(res.headers.get("retry-after"));
    console.warn(
      `[LLM] ${provider.name} 429 — waiting ${waitSec}s then retry once`
    );
    await sleep(waitSec * 1000 + 200);
    lastCallAt.set(provider.name, Date.now());
    res = await postChat(provider, payload);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.warn(
      `[LLM] ${provider.name} ${res.status}: ${errText.slice(0, 200)}`
    );
    return null;
  }

  const json = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string; reasoning?: string };
    }>;
  };
  let content = json.choices?.[0]?.message?.content?.trim() || "";
  // Some Groq reasoning models put the usable answer after thinking noise
  if (!content) {
    const reasoning = json.choices?.[0]?.message?.reasoning?.trim() || "";
    if (reasoning) {
      const tail = reasoning.split(/\n/).filter(Boolean).slice(-1)[0] || "";
      content = tail.slice(0, 500);
    }
  }
  if (!content) return null;

  return {
    content,
    provider: provider.name,
    model: provider.model,
  };
}

/**
 * Chat completion with automatic provider failover.
 * Callers that need per-user daily caps should call tryConsumeApi first.
 */
export async function chatCompletion(opts: {
  messages: LlmMessage[];
  task?: LlmTask;
  temperature?: number;
  maxTokens?: number;
}): Promise<LlmCallResult> {
  const task = opts.task || "generic";
  const limits = TASK_LIMITS[task];
  const providers = listLlmProviders(task);
  if (!providers.length) return null;

  const messages = truncateMessages(opts.messages, task);
  const promptText = messages.map((m) => m.content).join("\n");
  const estIn = estimateTokens(promptText);
  const maxTokens = opts.maxTokens ?? limits.maxTokens;
  const estTotal = estIn + maxTokens;
  const temperature = opts.temperature ?? limits.temperature;

  for (const provider of providers) {
    try {
      const result = await tryProvider(provider, messages, {
        temperature,
        maxTokens,
        estTotal,
      });
      if (result) return result;
      console.warn(`[LLM] ${provider.name} returned empty — trying next`);
    } catch (err) {
      console.warn(
        `[LLM] ${provider.name} threw:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return null;
}

/** Convenience: system + user → content string. */
export async function completePrompt(opts: {
  system?: string;
  user: string;
  task?: LlmTask;
  temperature?: number;
  maxTokens?: number;
}): Promise<string | null> {
  const messages: LlmMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });
  const result = await chatCompletion({
    messages,
    task: opts.task,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
  });
  return result?.content || null;
}
