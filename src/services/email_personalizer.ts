import { prisma } from "@/lib/prisma";
import { getProfileBundle } from "@/services/profile_service";

type ProfessorLike = {
  name: string;
  university: string;
  researchFocus?: string | null;
  recentPaper?: string | null;
  labName?: string | null;
  title?: string | null;
};

function lastName(full: string) {
  const cleaned = full.replace(/^Dr\.\s*/i, "").trim();
  const parts = cleaned.split(/\s+/);
  return parts[parts.length - 1] || cleaned;
}

function sanitize(text: string) {
  return text
    .replace(/—/g, " - ")
    .replace(/–/g, " - ")
    .replace(/\u2014/g, " - ");
}

async function callLlm(system: string, user: string): Promise<string | null> {
  const base = process.env.PROVOCATIVE_BASE_URL;
  const key = process.env.PROVOCATIVE_API_KEY;
  const model = process.env.PRIMARY_MODEL || "qwen3.6-35b";
  if (!base || !key) return null;
  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.45,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content || null;
}

function fallbackEmail(
  professor: ProfessorLike,
  studentName: string,
  brief: string,
  workMode: string
) {
  const ln = lastName(professor.name);
  const paper =
    professor.recentPaper ||
    professor.researchFocus ||
    "your recent work";
  const subject = `Interest in your research at ${professor.university}`;
  const body = `Dear Dr. ${ln},

I hope this note finds you well. I am ${studentName}, and I am writing because your work at ${professor.university}${professor.labName ? ` (${professor.labName})` : ""} on ${paper} aligns closely with what I have been building.

A few relevant highlights from my background:
${brief
  .split("\n")
  .filter((l) => l.startsWith("- "))
  .slice(0, 4)
  .join("\n") || "- Dedicated student researcher seeking mentored lab experience"}

I would be grateful for the chance to contribute ${workMode} this term, even a few hours per week. I have attached my CV if helpful.

Thank you for your time and consideration.

Sincerely,
${studentName}`;
  return { subject, body };
}

export async function generatePersonalizedDraft(opts: {
  userId: string;
  professorId: string;
}) {
  const professor = await prisma.professor.findFirst({
    where: { id: opts.professorId, userId: opts.userId },
  });
  if (!professor) throw new Error("Professor not found");

  const bundle = await getProfileBundle(opts.userId);
  const profile = bundle?.profile;
  const studentName =
    profile?.displayName || bundle?.user.name || "Student researcher";
  const brief = profile?.profileBrief || "";
  const workMode = profile?.workModePref || "remote";
  const tone = profile?.tonePreference || "warm_professional";
  const style = profile?.writingStyleNotes || "";

  const system = `You write short, human research inquiry emails from a student to a professor.
Rules:
- Return ONLY JSON: {"subject":"...","body":"..."}
- Address the professor as Dr. <LastName>
- Reference their university and a specific paper/topic if provided
- Weave in 2-4 concrete student achievements from the profile brief
- Match tone: ${tone}
- Style notes: ${style || "clear, specific, no fluff"}
- No em dashes. No fake publications. No purple prose.
- Keep body under 220 words.
- End with a soft ask for a brief conversation or volunteer contribution (${workMode}).`;

  const userPrompt = `PROFESSOR:
Name: ${professor.name}
University: ${professor.university}
Title: ${professor.title || ""}
Lab: ${professor.labName || ""}
Focus: ${professor.researchFocus || ""}
Recent paper/topic: ${professor.recentPaper || ""}

STUDENT PROFILE BRIEF:
${brief.slice(0, 4000)}

Student sign-off name: ${studentName}`;

  let subject = "";
  let body = "";
  let providerUsed = "template";
  let isFallback = true;

  const raw = await callLlm(system, userPrompt);
  if (raw) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as { subject?: string; body?: string };
        if (parsed.subject && parsed.body) {
          subject = sanitize(parsed.subject);
          body = sanitize(parsed.body);
          const ln = lastName(professor.name);
          body = body.replace(
            /^Dear (Dr\.|Professor) [^,\n]+,/i,
            `Dear Dr. ${ln},`
          );
          providerUsed = `Provocative (${process.env.PRIMARY_MODEL || "llm"})`;
          isFallback = false;
        }
      } catch {
        /* fall through */
      }
    }
  }

  if (!subject || !body) {
    const fb = fallbackEmail(professor, studentName, brief, workMode);
    subject = fb.subject;
    body = fb.body;
  }

  const draft = await prisma.draft.create({
    data: {
      userId: opts.userId,
      professorId: professor.id,
      subject,
      body,
      recipientEmail: professor.email,
      status: "pending",
      providerUsed,
      isFallback,
    },
  });

  return draft;
}

export async function generateDraftsForProfessors(
  userId: string,
  professorIds: string[]
) {
  const created = [];
  for (const id of professorIds.slice(0, 20)) {
    const existing = await prisma.draft.findFirst({
      where: { userId, professorId: id, status: "pending" },
    });
    if (existing) {
      created.push(existing);
      continue;
    }
    created.push(await generatePersonalizedDraft({ userId, professorId: id }));
  }
  return created;
}
