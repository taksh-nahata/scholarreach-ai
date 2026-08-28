import { prisma } from "@/lib/prisma";
import { ensureProfile, parseJsonField } from "@/services/profile_service";
import { mergeInterviewIntoProfile } from "@/services/cv_ingest";

export type ChatMessage = {
  role: "assistant" | "user";
  content: string;
  at?: string;
};

const QUESTION_BANK: Array<{ id: string; prompt: string }> = [
  {
    id: "hook",
    prompt:
      "Start with the win you're most proud of in the last 2 years — competition, research, project, or leadership. What happened, and what was your role?",
  },
  {
    id: "research",
    prompt:
      "Have you done any research, lab work, or technical projects with a mentor? Name the lab/person if you can, and what you built or studied.",
  },
  {
    id: "skills",
    prompt:
      "Which tools or skills feel strongest right now (languages, hardware, math, writing)? Give concrete examples of where you used them.",
  },
  {
    id: "why",
    prompt:
      "Why are you reaching out to professors this season? What kind of mentorship or project are you hoping for?",
  },
  {
    id: "style",
    prompt:
      "How do you want your emails to sound — warm and curious, short and direct, or more formal? Any phrases you always use (or never want used)?",
  },
  {
    id: "availability",
    prompt:
      "How many hours per week can you commit, and are you open to remote, hybrid, or in-person only?",
  },
];

async function llmFollowUp(
  history: ChatMessage[],
  profileHint: string
): Promise<string | null> {
  const { chatCompletion } = await import("@/services/llm_client");
  const result = await chatCompletion({
    task: "chat",
    temperature: 0.5,
    messages: [
      {
        role: "system",
        content: `You help students remember achievements for research outreach emails.
Ask ONE specific follow-up question at a time. Be concise (2 sentences max).
Never invent achievements. Use their profile context if helpful.
Profile context:
${profileHint.slice(0, 900)}`,
      },
      ...history.slice(-6).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content.slice(0, 500),
      })),
    ],
  });
  return result?.content || null;
}

function nextBankQuestion(history: ChatMessage[]): string | null {
  const asked = history.filter((m) => m.role === "assistant").length;
  if (asked >= QUESTION_BANK.length) return null;
  return QUESTION_BANK[asked].prompt;
}

export async function startOrContinueInterview(userId: string) {
  await ensureProfile(userId);
  const profile = await prisma.studentProfile.findUnique({ where: { userId } });
  let history = parseJsonField<ChatMessage[]>(profile?.interviewJson, []);

  if (history.length === 0) {
    const first =
      (await llmFollowUp([], profile?.profileBrief || "")) ||
      QUESTION_BANK[0].prompt;
    history = [
      {
        role: "assistant",
        content: first,
        at: new Date().toISOString(),
      },
    ];
    await prisma.studentProfile.update({
      where: { userId },
      data: {
        interviewJson: JSON.stringify(history),
        onboardingStep: "interview",
      },
    });
  }

  return { messages: history, complete: !!profile?.interviewComplete };
}

export async function answerInterview(userId: string, answer: string) {
  const text = answer.trim();
  if (!text) throw new Error("Please write a short answer.");

  await ensureProfile(userId);
  const profile = await prisma.studentProfile.findUnique({ where: { userId } });
  const history = parseJsonField<ChatMessage[]>(profile?.interviewJson, []);

  history.push({
    role: "user",
    content: text,
    at: new Date().toISOString(),
  });

  const userTurns = history.filter((m) => m.role === "user").length;
  let complete = false;
  let assistantReply: string;

  if (userTurns >= QUESTION_BANK.length) {
    complete = true;
    assistantReply =
      "That gives us enough to write emails that sound like you. Next, pick the regions you want to target.";
  } else {
    assistantReply =
      (await llmFollowUp(history, profile?.profileBrief || "")) ||
      nextBankQuestion(history) ||
      "Anything else a professor should know about your background?";
  }

  history.push({
    role: "assistant",
    content: assistantReply,
    at: new Date().toISOString(),
  });

  const brief = mergeInterviewIntoProfile(profile?.profileBrief, history);

  await prisma.studentProfile.update({
    where: { userId },
    data: {
      interviewJson: JSON.stringify(history),
      interviewComplete: complete,
      onboardingStep: complete ? "regions" : "interview",
      profileBrief: brief,
      // Append freeform achievements from answers when useful
      achievementsJson: (() => {
        const existing = parseJsonField<Array<Record<string, unknown>>>(
          profile?.achievementsJson,
          []
        );
        if (text.length > 40) {
          existing.push({
            title: text.slice(0, 90),
            detail: text,
            source: "interview",
          });
        }
        return JSON.stringify(existing.slice(-20));
      })(),
    },
  });

  return { messages: history, complete, reply: assistantReply };
}
