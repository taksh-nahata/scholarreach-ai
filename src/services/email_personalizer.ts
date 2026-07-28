/**
 * Profile-driven email personalizer (generalized from legacy llm_client.js).
 * Uses each student's StudentProfile brief — never hardcodes a person.
 */
import { prisma } from "@/lib/prisma";
import { getProfileBundle } from "@/services/profile_service";
import { tryConsumeApi } from "@/services/api_budget";
import { exaClient } from "@/services/exa_client";
import { reviewDraftAsStudent } from "@/services/draft_reviewer";
import {
  approveDraftToQueue,
  countHumanApprovals,
} from "@/services/approval_service";

type ProfessorLike = {
  id: string;
  name: string;
  university: string;
  researchFocus?: string | null;
  recentPaper?: string | null;
  labName?: string | null;
  title?: string | null;
  department?: string | null;
  locationMode?: string | null;
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

async function callLlm(
  userId: string,
  system: string,
  user: string
): Promise<string | null> {
  const base = process.env.PROVOCATIVE_BASE_URL;
  const key = process.env.PROVOCATIVE_API_KEY;
  const model = process.env.PRIMARY_MODEL || "qwen3.6-35b";
  if (!base || !key) return null;
  if (!(await tryConsumeApi(userId, "llm", 1))) return null;

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
    professor.recentPaper || professor.researchFocus || "your recent work";
  const subject = `Interest in your research at ${professor.university} (${studentName})`;
  const bullets =
    brief
      .split("\n")
      .filter((l) => l.startsWith("- "))
      .slice(0, 4)
      .join("\n") ||
    "- Dedicated student researcher seeking mentored lab experience";
  const body = `Dear Dr. ${ln},

I hope this note finds you well. I am ${studentName}, and I am writing because your work at ${professor.university}${professor.labName ? ` (${professor.labName})` : ""} on ${paper} aligns closely with what I have been building.

Here is how my background may support your lab:
${bullets}

I would be grateful for the chance to contribute ${workMode} this term, even a few hours per week. I have attached my CV if helpful.

Thank you for your time and consideration.

Sincerely,
${studentName}`;
  return { subject, body };
}

function workModeLabel(
  pref: string,
  professor: ProfessorLike
): string {
  const p = pref.toLowerCase();
  if (p.includes("flex")) return "flexible (remote or in-person as needed)";
  if (p.includes("hybrid")) return "hybrid";
  if (p.includes("person") || p.includes("local")) return "in-person";
  const mode = (professor.locationMode || "").toLowerCase();
  if (mode.includes("remote")) return "remote";
  return p.includes("remote") ? "remote" : pref || "remote";
}

async function maybeRefreshPaper(
  userId: string,
  professor: ProfessorLike
): Promise<string | null> {
  const existing = professor.recentPaper?.trim();
  if (existing && existing.length > 20 && !/^research$/i.test(existing)) {
    return existing;
  }
  if (!(await tryConsumeApi(userId, "exa", 1))) return existing || null;
  return (
    (await exaClient.findRecentPaper(
      professor.name,
      professor.university,
      professor.researchFocus || "research"
    )) || existing || null
  );
}

async function maybeAutoApprove(userId: string, draftId: string) {
  const profile = await prisma.studentProfile.findUnique({ where: { userId } });
  const mode = profile?.autoApproveMode || "manual";
  if (mode === "manual") return null;

  const minApprovals = profile?.autoApproveMinApprovals ?? 5;
  if (mode === "auto") {
    const n = await countHumanApprovals(userId);
    if (n < minApprovals) {
      await prisma.draft.update({
        where: { id: draftId },
        data: {
          reviewStatus: "awaiting_human",
          reviewNotes: `Auto-approve unlocks after ${minApprovals} human approvals (have ${n}).`,
        },
      });
      return null;
    }
  }

  // agent_gate and unlocked auto both run reviewer
  const verdict = await reviewDraftAsStudent({ userId, draftId });
  await prisma.draft.update({
    where: { id: draftId },
    data: {
      reviewStatus: verdict.approve ? "agent_approved" : "agent_rejected",
      reviewNotes: `${verdict.notes} (score ${verdict.score})`,
      matchScore: verdict.score,
    },
  });

  if (!verdict.approve) return { auto: false, verdict };

  const scheduled = await approveDraftToQueue({
    userId,
    draftId,
    via: "agent",
    specialNotes: verdict.notes,
  });
  return { auto: true, verdict, scheduled };
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
  if (!profile?.profileBrief && !profile?.cvText) {
    throw new Error(
      "Complete onboarding (CV + profile) before drafting so emails match your background."
    );
  }

  const studentName =
    profile?.displayName || bundle?.user.name || "Student researcher";
  const brief = profile?.profileBrief || "";
  const workMode = workModeLabel(profile?.workModePref || "remote", professor);
  const tone = profile?.tonePreference || "warm_professional";
  const style = profile?.writingStyleNotes || "";
  const interests = profile?.researchInterests || "";

  const paper =
    (await maybeRefreshPaper(opts.userId, professor)) ||
    professor.researchFocus ||
    "your recent work";

  if (paper && paper !== professor.recentPaper) {
    await prisma.professor.update({
      where: { id: professor.id },
      data: { recentPaper: paper },
    });
  }

  const ln = lastName(professor.name);
  const isPI = (professor.title || "").toLowerCase().includes("principal");
  const greeting = isPI
    ? `Dear Principal Investigator ${ln},`
    : `Dear Dr. ${ln},`;

  const system = `You write short, human research inquiry emails FROM a student TO a professor.
Rules:
- Return ONLY JSON: {"subject":"...","body":"..."}
- Student identity MUST come only from the provided profile brief. Never invent another person's name, schools, or labs.
- Address exactly: "${greeting}"
- Write in second person to the professor ("your lab", "your paper"). Never third-person about them.
- Cite a SPECIFIC paper/project title when provided: "${paper}"
- Select 1-3 student bullets that best match THIS professor's focus — do not dump the whole CV.
- Match tone: ${tone}
- Style notes: ${style || "clear, specific, humble, no fluff"}
- Work mode must be exactly: ${workMode}
- No em dashes. No fake publications.
- Body under 220 words.
- Mention CV attached. Soft ask for a short call or volunteer contribution.
- Subject should include student last/first name naturally.`;

  const userPrompt = `PROFESSOR:
Name: ${professor.name}
University: ${professor.university}
Title: ${professor.title || ""}
Lab/Dept: ${professor.labName || professor.department || ""}
Focus: ${professor.researchFocus || ""}
Recent paper/topic: ${paper}
Location mode: ${professor.locationMode || ""}

STUDENT INTERESTS (targeting):
${interests || "(see brief)"}

STUDENT PROFILE BRIEF:
${brief.slice(0, 4500)}

Student sign-off name: ${studentName}`;

  let subject = "";
  let body = "";
  let providerUsed = "template";
  let isFallback = true;

  const raw = await callLlm(opts.userId, system, userPrompt);
  if (raw) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as {
          subject?: string;
          body?: string;
        };
        if (parsed.subject && parsed.body) {
          subject = sanitize(parsed.subject);
          body = sanitize(parsed.body);
          body = body.replace(
            /^Dear (Dr\.|Professor|Principal Investigator) [^,\n]+,/i,
            greeting
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
      matchScore: professor.matchScore,
      reviewStatus: "pending_review",
    },
  });

  const auto = await maybeAutoApprove(opts.userId, draft.id);
  const refreshed = await prisma.draft.findUnique({ where: { id: draft.id } });
  return { draft: refreshed || draft, auto };
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
    const result = await generatePersonalizedDraft({
      userId,
      professorId: id,
    });
    created.push(result.draft);
  }
  return created;
}
