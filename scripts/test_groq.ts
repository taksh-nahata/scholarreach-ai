import "dotenv/config";
import {
  chatCompletion,
  llmConfigured,
  llmProviderLabel,
} from "../src/services/llm_client";

async function main() {
  console.log("configured:", llmConfigured());
  console.log("draft provider:", llmProviderLabel("draft"));
  console.log("fast provider:", llmProviderLabel("review"));
  console.log("key present:", Boolean(process.env.GROQ_API_KEY));

  const r = await chatCompletion({
    task: "chat",
    messages: [{ role: "user", content: "Reply with exactly the word ping" }],
    maxTokens: 8,
  });
  console.log("chat result:", r);

  const draft = await chatCompletion({
    task: "draft",
    messages: [
      {
        role: "system",
        content:
          'Return ONLY JSON: {"subject":"...","body":"Dear Professor X,\\n\\nshort note\\n\\nSincerely,\\nTaksh"}',
      },
      {
        role: "user",
        content:
          "Write a 4-sentence research outreach note to Professor Smyth about fair survival ML. Student is HS dual-enrolled.",
      },
    ],
    maxTokens: 200,
  });
  console.log("draft result provider:", draft?.provider, draft?.model);
  console.log("draft snippet:", draft?.content?.slice(0, 300));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
