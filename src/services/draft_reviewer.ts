/**
 * Second-pass agent that reviews a draft the way a careful student would.
 * Heuristics first — only spend an LLM credit on borderline cases.
 */
import { prisma } from "@/lib/prisma";
import { getProfileBundle } from "@/services/profile_service";
import { tryConsumeApi } from "@/services/api_budget";
import { resolveOutboundAttachments } from "@/services/profile_attachments";

export type ReviewVerdict = {
  approve: boolean;
  score: number;
  notes: string;
  issues: string[];
  usedLlm?: boolean;
};

async function callLlm(prompt: string): Promise<string | null> {
  const { completePrompt } = await import("@/services/llm_client");
  return completePrompt({
    system:
      "You are a strict academic outreach editor. Return ONLY compact JSON.",
    user: prompt.slice(0, 2800),
    task: "review",
  });
}

function heuristicReview(opts: {
  subject: string;
  body: string;
  studentName: string;
  willAttach: boolean;
  requireDualEnrollmentClarity?: boolean;
  professorName?: string | null;
  professorFocus?: string | null;
  recentPaper?: string | null;
}): ReviewVerdict {
  const {
    subject,
    body,
    studentName,
    willAttach,
    requireDualEnrollmentClarity,
    professorName,
    professorFocus,
    recentPaper,
  } = opts;
  const issues: string[] = [];
  const critical: string[] = [];
  const trimmed = body.trim();
  const lower = body.toLowerCase();

  if (body.length < 140) issues.push("Body too short");
  if (body.length > 2400) issues.push("Body too long");

  if (!/^dear (dr\.|professor|prof\.)\s+\S+/i.test(trimmed)) {
    critical.push("Missing proper greeting (Dear Dr./Professor LastName)");
  }

  if (/—|–/.test(body) || /—|–/.test(subject)) {
    issues.push("Contains em/en dashes");
  }
  if (/\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)]+\)/.test(body)) {
    issues.push("Contains Markdown that will look broken in Gmail");
  }
  if (/\b(i am writing to inquire about the possibility)\b/i.test(body)) {
    issues.push("Generic opener");
  }

  // Structure checks aligned with our required email shape
  const hasPaperCite =
    /"[^"]{12,}"/.test(body) ||
    (recentPaper
      ? body.toLowerCase().includes(recentPaper.toLowerCase().slice(0, 40))
      : false) ||
    (professorFocus
      ? body.toLowerCase().includes(professorFocus.toLowerCase().slice(0, 24))
      : false);
  if (!hasPaperCite) {
    issues.push("No specific paper/topic citation");
  }

  const bulletCount = (body.match(/^\s*•\s+/gm) || []).length;
  if (bulletCount < 1) issues.push("Missing ability bullets");
  if (bulletCount > 5) issues.push("Too many bullets");

  if (
    !/\b(meet|meeting|call|chat|speak|zoom|conversation|time for)\b/i.test(body)
  ) {
    issues.push("No meeting/call ask");
  }

  if (requireDualEnrollmentClarity) {
    const hasHs = /\bhigh\s*school\b/i.test(body);
    const hasDual = /\bdual[\s-]?enroll/i.test(body);
    if (!hasHs || !hasDual) {
      critical.push(
        "Must clearly say high school + dual enrollment (faculty confuse this with college applicants)"
      );
    }
  }

  if (willAttach && !/\bcv\b|\bresume\b/i.test(body)) {
    issues.push("Attachment planned but no CV/resume mention");
  }
  if (
    !willAttach &&
    /\b(attached (my )?(cv|resume)|i have attached my (cv|resume)|cv (is )?attached|resume attached)\b/i.test(
      body
    )
  ) {
    critical.push("Claims CV/resume is attached but nothing will attach");
  }

  if (
    studentName &&
    !lower.includes(studentName.toLowerCase().split(/\s+/)[0] || "___")
  ) {
    issues.push("Student first name missing from body");
  }

  const last =
    (professorName || "")
      .replace(/^dr\.?\s*/i, "")
      .trim()
      .split(/\s+/)
      .pop() || "";
  if (
    last.length > 2 &&
    !new RegExp(
      last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    ).test(body.slice(0, 80))
  ) {
    issues.push("Greeting may not address this professor's last name");
  }

  const allIssues = [...critical, ...issues];
  const score = Math.max(
    15,
    96 - critical.length * 28 - issues.length * 10
  );
  const approve =
    critical.length === 0 && allIssues.length <= 1 && score >= 72;

  return {
    approve,
    score,
    notes: allIssues.length
      ? allIssues.join("; ")
      : "Heuristic structure checks passed",
    issues: allIssues,
    usedLlm: false,
  };
}

export async function reviewDraftAsStudent(opts: {
  userId: string;
  draftId: string;
  /** Skip LLM entirely — heuristic checks only (autopilot cron path). */
  heuristicOnly?: boolean;
}): Promise<ReviewVerdict> {
  const draft = await prisma.draft.findFirst({
    where: { id: opts.draftId, userId: opts.userId },
    include: { professor: true },
  });
  if (!draft) {
    return {
      approve: false,
      score: 0,
      notes: "Draft not found",
      issues: ["missing"],
      usedLlm: false,
    };
  }

  const bundle = await getProfileBundle(opts.userId);
  const studentName =
    bundle?.profile?.displayName || bundle?.user.name || "Student";
  const brief = bundle?.profile?.profileBrief || "";
  const tone = bundle?.profile?.tonePreference || "warm_professional";
  const style = bundle?.profile?.writingStyleNotes || "";
  const customRules =
    (bundle?.profile as { customRules?: string | null } | null)?.customRules ||
    "";

  const resolved = await resolveOutboundAttachments(opts.userId, {
    professorFocus: draft.professor?.researchFocus,
    professorUniversity: draft.professor?.university,
    customRules,
  });
  const willAttach = resolved.attachments.length > 0;
  const requireDualEnrollmentClarity =
    /dual[\s-]?enroll/i.test(
      `${bundle?.profile?.gradeOrYear || ""} ${bundle?.profile?.headline || ""} ${bundle?.profile?.school || ""} ${brief.slice(0, 400)}`
    ) || /folsom\s+lake|high\s*school/i.test(
      `${bundle?.profile?.gradeOrYear || ""} ${bundle?.profile?.headline || ""} ${bundle?.profile?.school || ""}`
    );

  const heuristic = heuristicReview({
    subject: draft.subject,
    body: draft.body,
    studentName,
    willAttach,
    requireDualEnrollmentClarity,
    professorName: draft.professor?.name,
    professorFocus: draft.professor?.researchFocus,
    recentPaper: draft.professor?.recentPaper,
  });

  if (opts.heuristicOnly) {
    return {
      ...heuristic,
      notes: `${heuristic.notes} [heuristic-only autopilot]`,
      usedLlm: false,
    };
  }

  // Credit saver: clear pass / clear fail → no LLM
  const clearPass = heuristic.issues.length === 0 && heuristic.approve;
  const clearFail =
    heuristic.issues.length >= 2 ||
    heuristic.issues.some((i) =>
      /Claims CV|Missing proper greeting|Draft not found/i.test(i)
    );
  if (clearPass || clearFail) {
    return {
      ...heuristic,
      notes: `${heuristic.notes} [heuristic-only, no LLM]`,
      usedLlm: false,
    };
  }

  // Borderline only — spend one LLM credit
  const canLlm = await tryConsumeApi(opts.userId, "llm", 1);
  if (!canLlm) return heuristic;

  const cvRule = willAttach
    ? `Must mention the attached ${resolved.credentialDocType === "resume" ? "resume" : "CV"}`
    : "Must NOT claim a CV/resume is attached";

  const prompt = `Review this research cold email as if you ARE the student (${studentName}).
Decide whether THEY would approve sending it. Be thorough but fair.

Approve only if ALL hold:
- Correct greeting for this person (Dear Dr./Professor LastName)
- Student intro is clear
- Specific paper/topic cited (ideally quoted): look for "${(draft.professor?.recentPaper || draft.professor?.researchFocus || "").slice(0, 80)}"
- How the student can help that work
- 1-3 concrete ability bullets matching BOTH student profile AND professor focus
- Soft meeting ask
- ${cvRule}
- Tone: ${tone}; style: ${style || "warm, specific, humble"}
- No Markdown, no em dashes, no fake pubs, no wrong identity
${customRules.trim() ? `- Obey student custom rules: ${customRules.trim().slice(0, 500)}` : ""}

STUDENT BRIEF (excerpt):
${brief.slice(0, 2000)}

PROFESSOR:
${draft.professor?.name} @ ${draft.professor?.university}
Focus: ${draft.professor?.researchFocus || ""}
Paper: ${draft.professor?.recentPaper || ""}

SUBJECT: ${draft.subject}

BODY:
${draft.body.slice(0, 3500)}

Return JSON only:
{"approve":true|false,"score":0-100,"notes":"one sentence","issues":["..."]}`;

  const raw = await callLlm(prompt);
  if (!raw) return heuristic;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return heuristic;
  try {
    const parsed = JSON.parse(match[0]) as ReviewVerdict;
    // Don't let a soft LLM approve override a critical heuristic fail
    const criticalBlock = heuristic.issues.some((i) =>
      /Claims CV|Missing proper greeting/i.test(i)
    );
    const approve = criticalBlock ? false : !!parsed.approve;
    return {
      approve,
      score: Number(parsed.score) || heuristic.score,
      notes: `${String(parsed.notes || "")} [llm]`.trim(),
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.map(String)
        : heuristic.issues,
      usedLlm: true,
    };
  } catch {
    return heuristic;
  }
}
