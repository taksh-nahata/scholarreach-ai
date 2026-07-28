/**
 * Second-pass agent that reviews a draft the way a careful student would.
 * Used for auto-approve / agent-gate modes — no extra search APIs.
 */
import { prisma } from "@/lib/prisma";
import { getProfileBundle } from "@/services/profile_service";
import { tryConsumeApi } from "@/services/api_budget";

export type ReviewVerdict = {
  approve: boolean;
  score: number;
  notes: string;
  issues: string[];
};

async function callLlm(prompt: string): Promise<string | null> {
  const base = process.env.PROVOCATIVE_BASE_URL;
  const key = process.env.PROVOCATIVE_API_KEY;
  if (!base || !key) return null;
  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.PRIMARY_MODEL || "qwen3.6-35b",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a strict academic outreach editor. Return ONLY JSON.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content || null;
}

function heuristicReview(subject: string, body: string, studentName: string): ReviewVerdict {
  const issues: string[] = [];
  const lower = body.toLowerCase();
  if (body.length < 120) issues.push("Body too short");
  if (body.length > 2200) issues.push("Body too long");
  if (!/^dear (dr\.|professor)/i.test(body.trim())) {
    issues.push("Missing proper greeting");
  }
  if (/—|–/.test(body) || /—|–/.test(subject)) issues.push("Contains em/en dashes");
  if (/\b(i am writing to inquire about the possibility)\b/i.test(body)) {
    issues.push("Generic opener");
  }
  if (!studentName || !body.toLowerCase().includes(studentName.split(" ")[0].toLowerCase())) {
    // soft — sign-off may still be fine
  }
  if (!/\bcv\b|\bresume\b/i.test(body)) issues.push("No CV/resume mention");
  if (lower.includes("taksh") && !studentName.toLowerCase().includes("taksh")) {
    issues.push("Wrong student name leaked into draft");
  }
  const score = Math.max(20, 92 - issues.length * 12);
  return {
    approve: issues.length <= 1 && score >= 70,
    score,
    notes: issues.length ? issues.join("; ") : "Heuristic checks passed",
    issues,
  };
}

export async function reviewDraftAsStudent(opts: {
  userId: string;
  draftId: string;
}): Promise<ReviewVerdict> {
  const draft = await prisma.draft.findFirst({
    where: { id: opts.draftId, userId: opts.userId },
    include: { professor: true },
  });
  if (!draft) {
    return { approve: false, score: 0, notes: "Draft not found", issues: ["missing"] };
  }

  const bundle = await getProfileBundle(opts.userId);
  const studentName =
    bundle?.profile?.displayName || bundle?.user.name || "Student";
  const brief = bundle?.profile?.profileBrief || "";
  const tone = bundle?.profile?.tonePreference || "warm_professional";
  const style = bundle?.profile?.writingStyleNotes || "";

  const heuristic = heuristicReview(draft.subject, draft.body, studentName);

  const canLlm = await tryConsumeApi(opts.userId, "llm", 1);
  if (!canLlm) return heuristic;

  const prompt = `Review this research cold email as if you ARE the student (${studentName}).
Decide whether THEY would approve sending it.

Approve only if:
- Correct professor addressed (Dr. LastName), first person to them
- Specific paper/topic referenced (not vague "your research")
- 1-3 bullets that match BOTH student profile AND professor focus
- Tone matches: ${tone}
- Style: ${style || "warm, specific, humble"}
- No em dashes, no fake pubs, no wrong student identity
- Soft ask + CV mention

STUDENT BRIEF (excerpt):
${brief.slice(0, 2500)}

PROFESSOR:
${draft.professor?.name} @ ${draft.professor?.university}
Focus: ${draft.professor?.researchFocus || ""}
Paper: ${draft.professor?.recentPaper || ""}

SUBJECT: ${draft.subject}

BODY:
${draft.body}

Return JSON only:
{"approve":true|false,"score":0-100,"notes":"one sentence","issues":["..."]}`;

  const raw = await callLlm(prompt);
  if (!raw) return heuristic;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return heuristic;
  try {
    const parsed = JSON.parse(match[0]) as ReviewVerdict;
    return {
      approve: !!parsed.approve,
      score: Number(parsed.score) || heuristic.score,
      notes: String(parsed.notes || ""),
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
    };
  } catch {
    return heuristic;
  }
}
