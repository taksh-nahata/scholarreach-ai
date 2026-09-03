import { prisma } from "@/lib/prisma";
import { getProfileBundle } from "@/services/profile_service";
import { tryConsumeApi } from "@/services/api_budget";
import { freeFirstMode } from "@/lib/free_first_mode";
import { applyAgentGateToDraft } from "@/services/pending_approvals_sweep";
import { getProfessorOutreachBlockReason } from "@/services/outreach_guard";
import {
  hasUploadedCv,
  prepareEmailBodies,
  sanitizeEmailText,
} from "@/services/email_format";
import {
  attachmentContextBrief,
  resolveOutboundAttachments,
} from "@/services/profile_attachments";
import { credentialNoun, credentialPhrase } from "@/services/doc_type";
import {
  classifyFacultyTitle,
  roleDisplayLabel,
  roleEmailGuidance,
  roleGreeting,
  type FacultyRole,
} from "@/services/faculty_role";
import {
  ACCEPTANCE_STRUCTURE_PROMPT,
  bodyCitesJunkPaperId,
  bodyHasGenericFamiliarity,
  bodyHasWeakOfferBullets,
  intensityLine,
  isUsablePaperTitle,
  scoreAcceptanceFormat,
} from "@/services/email_acceptance_format";
import { fetchPaperContext, isStrongResearchPaperTitle } from "@/services/paper_context";
import { buildOutreachLetter } from "@/services/outreach_letter";
import { emailConfidenceTier } from "@/services/email_confidence";
import { scoreEmailQuality } from "@/services/email_quality_scorer";
import { getOutreachLearnings } from "@/services/outreach_learning";
import {
  formatCcForStorage,
  parseProfessorCc,
  parseSpecialInstructions,
  polishOutreachLetter,
} from "@/services/outreach_recipients";
import { parseProfessorMentorshipEvidence } from "@/services/mentorship_evidence";

/** Recover subject/body from LLM output even when JSON is slightly broken. */
function parseLlmDraftResponse(
  raw: string
): { subject: string; body: string } | null {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  const tryObj = (s: string) => {
    try {
      const parsed = JSON.parse(s) as { subject?: string; body?: string };
      if (parsed.subject?.trim() && parsed.body?.trim()) {
        return {
          subject: parsed.subject.trim(),
          body: parsed.body.trim(),
        };
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  const brace = text.match(/\{[\s\S]*\}/);
  if (brace) {
    const direct = tryObj(brace[0]);
    if (direct) return direct;

    // Common failure: raw newlines inside the body string — escape them
    const repaired = brace[0].replace(
      /"body"\s*:\s*"([\s\S]*?)"\s*(,|\})/i,
      (_m, body: string, tail: string) => {
        const esc = body
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\r?\n/g, "\\n")
          .replace(/\t/g, "\\t");
        return `"body":"${esc}"${tail}`;
      }
    );
    const fixed = tryObj(repaired);
    if (fixed) return fixed;
  }

  // Delimiter fallback
  const subjLine = text.match(
    /(?:^|\n)\s*(?:SUBJECT|subject)\s*[:：]\s*(.+)\s*(?:\n|$)/
  );
  const bodyPart = text.match(
    /(?:^|\n)\s*(?:BODY|body)\s*[:：]\s*\n?([\s\S]+)$/i
  );
  if (subjLine?.[1] && bodyPart?.[1]) {
    return {
      subject: subjLine[1].trim().replace(/^["']|["']$/g, ""),
      body: bodyPart[1].trim().replace(/^["']|["']$/g, ""),
    };
  }

  return null;
}

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
  mentorshipEvidence?: string | null;
};

function lastName(full: string) {
  const cleaned = full.replace(/^Dr\.\s*/i, "").trim();
  const parts = cleaned.split(/\s+/);
  return parts[parts.length - 1] || cleaned;
}

function roleOf(professor: ProfessorLike): FacultyRole {
  return classifyFacultyTitle(professor.title, {
    labName: professor.labName,
  });
}

/** Make sure a meeting/call ask exists near the close. */
function ensureMeetingAsk(body: string, role: FacultyRole): string {
  if (
    /\b(meet|meeting|call|chat|speak|zoom|office hours|brief conversation|quick talk)\b/i.test(
      body
    )
  ) {
    return body;
  }
  const line =
    role === "full_professor"
      ? "If you have 10–15 minutes sometime, I would be grateful for a brief meeting or even a short email reply."
      : "Would you have time for a short meeting (15 minutes) to see whether I could help on a current project?";

  const signOff = body.match(/\n(Sincerely|Best regards|Thank you|Warm regards)[,\s]/i);
  if (signOff && signOff.index != null) {
    return (
      body.slice(0, signOff.index).trimEnd() +
      `\n\n${line}\n` +
      body.slice(signOff.index)
    );
  }
  return `${body.trim()}\n\n${line}`;
}

async function callLlm(
  userId: string,
  system: string,
  user: string
): Promise<{ content: string; provider: string; model: string } | null> {
  if (!(await tryConsumeApi(userId, "llm", 1))) return null;
  const { chatCompletion } = await import("@/services/llm_client");
  return chatCompletion({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    task: "draft",
  });
}

function looksDualEnrollment(opts: {
  school?: string | null;
  gradeOrYear?: string | null;
  headline?: string | null;
  brief?: string | null;
}): boolean {
  const blob = [
    opts.school,
    opts.gradeOrYear,
    opts.headline,
    opts.brief?.slice(0, 800),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    /dual[\s-]?enroll/i.test(blob) ||
    (/high\s*school|hs\b|sophomore|junior|senior|9th|10th|11th|12th|grade\s*1[0-2]/i.test(
      blob
    ) &&
      /college|community|folsom|lake|cc\b/i.test(blob))
  );
}

/**
 * Clear student identity line so faculty do not mistake HS dual-enrolled
 * students for college applicants / undergrad admissions inquiries.
 */
function studentIntroLine(opts: {
  studentName: string;
  school?: string | null;
  gradeOrYear?: string | null;
  headline?: string | null;
  brief?: string | null;
}): string {
  const school = opts.school?.trim() || "";
  const year = opts.gradeOrYear?.trim() || "";
  const headline = opts.headline?.trim() || "";
  const dual = looksDualEnrollment(opts);

  if (dual || /folsom\s+lake/i.test(school) || /dual/i.test(headline + year)) {
    const college = /folsom\s+lake/i.test(school)
      ? school
      : school || "Folsom Lake College";
    return `I am ${opts.studentName}, a high school student dual-enrolled at ${college} (taking college courses while still in high school - not applying to undergrad programs)`;
  }

  if (school) {
    return year
      ? `I am ${opts.studentName}, a ${year} at ${school}`
      : `I am ${opts.studentName}, a student at ${school}`;
  }
  if (headline) {
    return `I am ${opts.studentName}, ${headline.replace(/^i am\s+/i, "")}`;
  }
  return `I am ${opts.studentName}, a student researcher`;
}

function identityClarityRule(opts: {
  school?: string | null;
  gradeOrYear?: string | null;
  headline?: string | null;
  brief?: string | null;
}): string {
  if (!looksDualEnrollment(opts) && !/folsom\s+lake/i.test(opts.school || "")) {
    return "";
  }
  return `
IDENTITY CLARITY (CRITICAL — professors keep misunderstanding this):
- In the WHO THE STUDENT IS paragraph, clearly state you are a HIGH SCHOOL student dual-enrolled at community college (Folsom Lake College if that is the school on file).
- Spell out what dual enrollment means in plain language: taking college courses while still in high school.
- Explicitly clarify this is a research/lab inquiry, NOT a college admissions or undergrad application request.
- Do NOT sound like you are applying to their university's undergraduate program.
- One clear sentence is enough; do not over-explain.`;
}

async function fallbackEmail(opts: {
  professor: ProfessorLike;
  studentName: string;
  brief: string;
  workMode: string;
  attach: boolean;
  docType?: string | null;
  school?: string | null;
  gradeOrYear?: string | null;
  headline?: string | null;
  availabilityNotes?: string | null;
  researchInterests?: string | null;
  skillsJson?: string | null;
  projectsJson?: string | null;
  extraLabels?: string[];
  studentLocation?: string | null;
}) {
  const {
    professor,
    studentName,
    brief,
    workMode,
    attach,
    docType,
    school,
    availabilityNotes,
    projectsJson,
    extraLabels = [],
    studentLocation,
  } = opts;
  const role = roleOf(professor);
  const ln = lastName(professor.name);
  const greeting = roleGreeting(role, ln);
  const hasRealPaper = isStrongResearchPaperTitle(professor.recentPaper);
  const paper = hasRealPaper
    ? professor.recentPaper!.trim().replace(/[.]+$/, "").replace(/^\d{2,4}\s+/, "")
    : isStrongResearchPaperTitle(professor.researchFocus)
      ? professor.researchFocus!.trim().replace(/[.]+$/, "")
      : null;

  const paperCtx = paper ? await fetchPaperContext(paper) : null;
  const mentorshipEvidence = parseProfessorMentorshipEvidence(
    professor.mentorshipEvidence
  );

  const letter = buildOutreachLetter({
    greeting,
    studentName,
    school,
    university: professor.university,
    labName: professor.labName,
    paperTitle: paper,
    researchFocus: professor.researchFocus,
    paper: paperCtx,
    projectsJson,
    brief,
    workMode,
    availabilityNotes,
    studentLocation: studentLocation || null,
    attach,
    docType,
    extraLabels,
    maxProjects: role === "full_professor" ? 2 : 3,
    mentorshipEvidence,
  });

  return { subject: letter.subject, body: letter.body, paperCtx };
}

/**
 * Resolve work-mode preference into a short label for email prose.
 * Never returns internal drafting instructions.
 */
function workModeLabel(
  pref: string,
  professor: ProfessorLike,
  profile?: {
    location?: string | null;
    schoolLocation?: string | null;
    school?: string | null;
    maxMilesInPerson?: number | null;
    maxMilesHybrid?: number | null;
  } | null
): string {
  const p = (pref || "remote").toLowerCase();
  if (p.includes("location")) {
    return resolveLocationBasedMode(professor, profile);
  }
  if (p.includes("flex")) return "flexible";
  if (p.includes("hybrid")) return "hybrid";
  if (p.includes("person") || p.includes("local")) return "in-person";
  const mode = (professor.locationMode || "").toLowerCase();
  if (mode.includes("remote")) return "remote";
  return p.includes("remote") ? "remote" : pref || "remote";
}

/** Guess remote vs hybrid/in-person from university + student home (no geocoder). */
function resolveLocationBasedMode(
  professor: ProfessorLike,
  profile?: {
    location?: string | null;
    schoolLocation?: string | null;
    school?: string | null;
  } | null
): string {
  const uni = (professor.university || "").toLowerCase();
  const homeBlob = [
    profile?.location,
    profile?.schoolLocation,
    profile?.school,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Known nearby schools for Folsom / Sacramento metro
  const localUnis = [
    "folsom lake",
    "sierra college",
    "american river",
    "sacramento state",
    "california state university, sacramento",
    "csu sacramento",
    "uc davis",
    "university of california, davis",
    "university of california davis",
  ];
  if (localUnis.some((u) => uni.includes(u))) {
    return "hybrid";
  }

  // Same metro hint in university name + student in Folsom/Sacramento
  const studentLocal = /\b(folsom|sacramento|roseville|el dorado|placer)\b/i.test(
    homeBlob
  );
  if (
    studentLocal &&
    /\b(sacramento|davis|folsom)\b/i.test(uni) &&
    !/\b(georgia|tech|mit|harvard|stanford|berkeley|los angeles|san diego|austin|seattle)\b/i.test(
      uni
    )
  ) {
    return "hybrid";
  }

  // Default: unknown or far → strictly remote (never dump the decision rules)
  return "remote";
}

async function maybeRefreshPaper(
  userId: string,
  professor: ProfessorLike
): Promise<string | null> {
  const existing = professor.recentPaper?.trim();
  if (isStrongResearchPaperTitle(existing)) {
    return existing || null;
  }
  const { findRecentPaperRedundant } = await import("./faculty_search");
  const paper = await findRecentPaperRedundant(
    userId,
    professor.name,
    professor.university,
    professor.researchFocus
  );
  if (isStrongResearchPaperTitle(paper)) return paper;
  if (isStrongResearchPaperTitle(professor.researchFocus)) {
    return professor.researchFocus || null;
  }
  // Last resort: usable title even if not "strong"
  if (isUsablePaperTitle(paper)) return paper;
  return isUsablePaperTitle(existing) ? existing || null : null;
}

async function maybeAutoApprove(userId: string, draftId: string) {
  const result = await applyAgentGateToDraft(userId, draftId);
  if (result.action === "skipped" && result.notes.includes("Manual")) {
    return null;
  }
  if (result.action === "awaiting_human") {
    return null;
  }
  if (result.action === "queued") {
    return { auto: true, notes: result.notes };
  }
  if (result.action === "rejected") {
    return { auto: false, notes: result.notes };
  }
  return null;
}

export async function generatePersonalizedDraft(opts: {
  userId: string;
  professorId: string;
  /** Extra instruction for rewrite / format tweaks */
  formatHint?: string;
}) {
  const professor = await prisma.professor.findFirst({
    where: { id: opts.professorId, userId: opts.userId },
  });
  if (!professor) throw new Error("Professor not found");

  const blockReason = await getProfessorOutreachBlockReason(
    opts.userId,
    opts.professorId
  );
  if (blockReason === "already_contacted") {
    throw new Error(
      `Outreach was already sent to ${professor.name}. Use follow-ups instead.`
    );
  }
  if (blockReason === "already_queued") {
    throw new Error(
      `${professor.name} already has an email in the send queue.`
    );
  }
  if (blockReason === "draft_exists") {
    const existing = await prisma.draft.findFirst({
      where: {
        userId: opts.userId,
        professorId: opts.professorId,
        status: { in: ["pending", "pending_review", "scheduled", "approved"] },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (existing) {
      return {
        draft: existing,
        auto: null,
        hasCv: false,
        formatScore: 0,
        reused: true,
      };
    }
  }

  if (!professor.email || !professor.emailVerified) {
    throw new Error(
      `No verified email for ${professor.name}. Re-check emails in Directory first.`
    );
  }
  const emailConfidence = emailConfidenceTier({
    email: professor.email,
    name: professor.name,
    university: professor.university,
    homepageUrl: professor.homepageUrl,
  });
  if (emailConfidence.tier === "low") {
    throw new Error(
      `Email confidence is too low for ${professor.name}. Re-verify address in Directory before drafting.`
    );
  }

  const bundle = await getProfileBundle(opts.userId);
  const profile = bundle?.profile;
  if (!profile?.profileBrief && !profile?.cvText) {
    throw new Error(
      "Complete onboarding (CV + profile) before drafting so emails match your background."
    );
  }

  const studentName =
    profile?.displayName || bundle?.user.name || "Student researcher";
  const brief = profile?.profileBrief || profile?.cvText || "";
  const learnings = await getOutreachLearnings(opts.userId);
  const learningBlock = learnings?.promptBrief
    ? `\n${learnings.promptBrief}\n`
    : "";
  const school = profile?.school || null;
  const gradeOrYear = profile?.gradeOrYear || null;
  const headline = profile?.headline || null;
  const workMode = workModeLabel(
    profile?.workModePref || "remote",
    professor,
    profile as {
      location?: string | null;
      schoolLocation?: string | null;
      school?: string | null;
      maxMilesInPerson?: number | null;
      maxMilesHybrid?: number | null;
    }
  );
  const tone = profile?.tonePreference || "warm_professional";
  const style = profile?.writingStyleNotes || "";
  const customRules =
    (profile as { customRules?: string | null })?.customRules || "";
  const interests = profile?.researchInterests || "";
  const hasCv = hasUploadedCv(profile);
  const focus =
    (professor.researchFocus || "").split(/[.;\n]/)[0]?.trim() ||
    "your research area";

  const resolved = await resolveOutboundAttachments(opts.userId, {
    professorFocus: professor.researchFocus,
    professorUniversity: professor.university,
    customRules,
  });
  const attachCv = resolved.attachments.length > 0;
  const docType = resolved.credentialDocType;
  const credNoun = credentialNoun(docType);
  const credPhrase = credentialPhrase(docType);
  const fileBrief = await attachmentContextBrief(opts.userId);

  const paperRaw = await maybeRefreshPaper(opts.userId, professor);
  const paper = isUsablePaperTitle(paperRaw)
    ? (paperRaw as string)
    : isUsablePaperTitle(professor.researchFocus)
      ? (professor.researchFocus as string)
      : null;

  // Persist real titles; clear DOI/id junk so it never gets cited again
  if (paper && paper !== professor.recentPaper) {
    await prisma.professor.update({
      where: { id: professor.id },
      data: { recentPaper: paper },
    });
  } else if (
    professor.recentPaper &&
    !isUsablePaperTitle(professor.recentPaper)
  ) {
    await prisma.professor.update({
      where: { id: professor.id },
      data: { recentPaper: paper },
    });
  }

  const ln = lastName(professor.name);
  const role = roleOf(professor);
  const greeting = roleGreeting(role, ln);
  const roleGuide = roleEmailGuidance(role);
  const availabilityNotes =
    (profile as { availabilityNotes?: string | null })?.availabilityNotes ||
    null;
  const introHint = studentIntroLine({
    studentName,
    school,
    gradeOrYear,
    headline,
    brief,
  });
  const identityRule = identityClarityRule({
    school,
    gradeOrYear,
    headline,
    brief,
  });
  const timeHint = intensityLine({
    availabilityNotes,
    workModeLabel: workMode,
  });

  const extraLabels = resolved.mentionLabels.filter(
    (l) => !/^(cv|resume|cv\/resume)$/i.test(l)
  );
  const cvRule = attachCv
    ? `REQUIRED near the end: say you attached ${credPhrase} (use the word "${credNoun}" exactly, not the wrong synonym).${
        extraLabels.length
          ? ` Also mention these attached files: ${extraLabels.join(", ")}.`
          : ""
      }`
    : hasCv
      ? `Credential text is on file but will NOT be attached this send. Do NOT say a ${credNoun} is attached. Offer to share a one-page PDF if helpful.`
      : `Do NOT say a CV or resume is attached. Offer to share a one-page PDF if asked.`;

  const formatExtra = opts.formatHint
    ? `\nAdditional rewrite request from the student: ${opts.formatHint}`
    : "";

  const customBlock = customRules.trim()
    ? `\nSTUDENT CUSTOM RULES (must obey):\n${customRules.trim()}`
    : "";

  const studentLocation =
    (profile as { location?: string | null })?.location ||
    (profile as { schoolLocation?: string | null })?.schoolLocation ||
    null;

  // Template is the source of truth. LLM may only win if it clearly beats it.
  const template = await fallbackEmail({
    professor: { ...professor, recentPaper: paper },
    studentName,
    brief,
    workMode,
    attach: attachCv,
    docType,
    school,
    gradeOrYear,
    headline,
    availabilityNotes,
    researchInterests: interests,
    skillsJson: (profile as { skillsJson?: string | null })?.skillsJson,
    projectsJson: (profile as { projectsJson?: string | null })?.projectsJson,
    extraLabels,
    studentLocation,
  });

  let subject = template.subject;
  let body = template.body;
  let providerUsed = `template+${template.paperCtx?.source || "no_paper"}`;
  let isFallback = true;

  const paperInsightBlock = template.paperCtx
    ? `PAPER CONTEXT (use this; do not invent findings):
Title: ${template.paperCtx.title}
Abstract/excerpt: ${template.paperCtx.abstract || "(abstract unavailable — use title themes only)"}
Suggested takeaway seed: ${template.paperCtx.insight}
Themes: ${template.paperCtx.themes.join("; ")}`
    : `PAPER CONTEXT: no verified abstract. Cite focus honestly; never invent a paper finding.`;

  const system = `You write high-signal research inquiry emails FROM a student TO a faculty mentor.
Goal: maximize genuine reply chance while staying humble and easy to skim (~60 seconds).

Return ONLY minified JSON on one line (no markdown fences):
{"subject":"...","body":"..."}
Escape newlines inside body as \\n. No raw line breaks inside JSON strings.

FORMAT:
- PLAIN TEXT for Gmail. No Markdown, no em dashes, no fake pubs/awards/schools.
- Match tone: ${tone}
- Style: ${style || "clear, specific, humble, natural"}
- Address exactly: ${greeting}
- Second person only ("your paper", "your lab").
- Prefer a short subject like the TEMPLATE subject below (credential + remote skill focus), not a generic "Prospective Research Student" line.
- FORBIDDEN: "A concrete takeaway for me was this", "That is where I think I can help: not only by asking for advice", "I spent time with that work", "not just the lab homepage", abstract-regurgitation of the paper's problem statement, resume-speak without "I/We", leading with TechSteps / web apps on robotics-CV papers, AND offering CARLA/hyperspectral/CV pipelines on social-science migrant/climate/org papers. Match the TEMPLATE's domain.

NARRATIVE ARC (required):
short identity + remote ask → cite paper once → ONE technical method/CV/sensing hook (not the abstract's obvious problem) → honest remote pivot if physical robotics → 2–3 labeled first-person experience blocks (most relevant first) → hours + soft ask

${ACCEPTANCE_STRUCTURE_PROMPT}

TEMPLATE TO BEAT (keep this structure unless you clearly improve it):
Subject: ${template.subject}
Body:
${template.body}
${learningBlock}
Seed facts (adapt; do not inflate):
- Identity start: "${introHint}."
- Paper to cite in quotes ONCE: "${paper || focus || "their specific research focus (never invent a title or DOI)"}"
- Time/mode seed: "${timeHint}"
- Work mode for this faculty: ${workMode} (formal sentence only)
${identityRule}
ATTACHMENT RULE:
${cvRule}

ROLE ADAPTATION:
${roleGuide}
${formatExtra}${customBlock}`;

  const userPrompt = `FACULTY (show real familiarity — not a website skim):
Name: ${professor.name}
University: ${professor.university}
Title: ${professor.title || roleDisplayLabel(role)}
Role: ${role}
Lab/Dept: ${professor.labName || professor.department || ""}
Paper/project to cite: ${paper || "(no verified paper title — cite research focus only, never a DOI/id)"}
Focus: ${professor.researchFocus || ""}

${paperInsightBlock}

STUDENT:
Name: ${studentName}
School: ${school || "(not set)"}
Year/status: ${gradeOrYear || "(not set)"}
Headline: ${headline || "(not set)"}
Interests/goals: ${interests || "(see brief)"}
Availability notes: ${availabilityNotes || "(use sensible school-year + summer defaults)"}
Work mode: ${workMode}
Credential for this send: ${docType || "unknown"}
Files attaching: ${
    resolved.mentionLabels.length
      ? resolved.mentionLabels.join(", ")
      : "(none)"
  }

${fileBrief ? `${fileBrief}\n` : ""}
PROFILE BRIEF (only use real facts — pick what fits THIS faculty / paper):
${brief.slice(0, 1800)}`;

  const allowLlm =
    !freeFirstMode() &&
    (process.env.USE_LLM_EMAIL_DRAFTS || "false").toLowerCase() === "true" &&
    !!paper &&
    isUsablePaperTitle(paper);

  if (allowLlm) {
    const llm = await callLlm(opts.userId, system, userPrompt);
    if (llm?.content) {
      const parsed = parseLlmDraftResponse(llm.content);
      if (parsed) {
        const llmSubject = sanitizeEmailText(parsed.subject);
        let llmBody = sanitizeEmailText(parsed.body);
        llmBody = llmBody.replace(
          /^Dear (Dr\.|Professor|Prof\.|Principal Investigator) [^,\n]+,/i,
          greeting
        );
        llmBody = ensureMeetingAsk(llmBody, role);

        const llmScore = scoreAcceptanceFormat({
          subject: llmSubject,
          body: llmBody,
          willAttach: attachCv,
          requireDualEnrollment: looksDualEnrollment({
            school,
            gradeOrYear,
            headline,
            brief,
          }),
        });
        const templateScore = scoreAcceptanceFormat({
          subject: template.subject,
          body: template.body,
          willAttach: attachCv,
          requireDualEnrollment: looksDualEnrollment({
            school,
            gradeOrYear,
            headline,
            brief,
          }),
        });

        const llmOk =
          llmScore.score >= Math.max(85, templateScore.score) &&
          !bodyCitesJunkPaperId(llmBody) &&
          !bodyHasWeakOfferBullets(llmBody) &&
          !bodyHasGenericFamiliarity(llmBody);

        if (llmOk) {
          subject = llmSubject;
          body = llmBody;
          providerUsed = `${llm.provider} (${llm.model})`;
          isFallback = false;
        } else {
          console.warn(
            `[email_personalizer] Keeping template (LLM score=${llmScore.score}, template=${templateScore.score}, junkPaper=${bodyCitesJunkPaperId(llmBody)}, weakBullets=${bodyHasWeakOfferBullets(llmBody)})`
          );
          providerUsed = `template (rejected ${llm.provider})`;
        }
      } else {
        console.warn(
          `[email_personalizer] LLM JSON parse failed (${llm.provider}):`,
          llm.content.slice(0, 180)
        );
      }
    }
  }

  // Soft quality gate — never ship junk paper ids or weak bullets
  const requireDual = looksDualEnrollment({
    school,
    gradeOrYear,
    headline,
    brief,
  });
  let scored = scoreAcceptanceFormat({
    subject,
    body,
    willAttach: attachCv,
    requireDualEnrollment: requireDual,
  });
  if (
    !isFallback &&
    (scored.score < 85 ||
      bodyCitesJunkPaperId(body) ||
      bodyHasWeakOfferBullets(body) ||
      bodyHasGenericFamiliarity(body))
  ) {
    subject = template.subject;
    body = template.body;
    providerUsed = `${providerUsed}+format_fallback`;
    isFallback = true;
    scored = scoreAcceptanceFormat({
      subject,
      body,
      willAttach: attachCv,
      requireDualEnrollment: requireDual,
    });
  }

  const ccList = parseProfessorCc(professor.ccEmails);
  const special = parseSpecialInstructions(professor.specialInstructions);
  const polished = polishOutreachLetter({
    subject,
    body,
    greeting,
    studentName,
    researchInterests: interests,
    special,
    ccEmails: ccList,
    willAttach: attachCv,
  });
  subject = polished.subject;
  body = polished.body;

  const prepared = prepareEmailBodies(body, {
    willAttach: attachCv,
    docType,
    extraLabels,
  });
  const quality = scoreEmailQuality({
    subject,
    body: prepared.body,
    professorFocus: professor.researchFocus,
  });

  const draft = await prisma.draft.create({
    data: {
      userId: opts.userId,
      professorId: professor.id,
      subject,
      body: prepared.body,
      htmlBody: prepared.htmlBody,
      recipientEmail: professor.email,
      ccEmails: formatCcForStorage(ccList),
      status: "pending",
      providerUsed,
      isFallback,
      matchScore: professor.matchScore,
      reviewStatus: "pending_review",
      reviewNotes: `acceptance_format_score=${scoreAcceptanceFormat({
        subject: prepared.body ? subject : subject,
        body: prepared.body,
        willAttach: attachCv,
        requireDualEnrollment: requireDual,
      }).score}; email_confidence=${emailConfidence.tier}:${emailConfidence.score}; quality=${quality.overall}; quality_notes=${quality.notes.join("|") || "none"}`,
    },
  });

  const auto = await maybeAutoApprove(opts.userId, draft.id);
  const refreshed = await prisma.draft.findUnique({ where: { id: draft.id } });
  return { draft: refreshed || draft, auto, hasCv, formatScore: scored.score };
}

export async function generateDraftsForProfessors(
  userId: string,
  professorIds: string[]
) {
  const created = [];
  const skipped: Array<{ professorId: string; reason: string }> = [];
  for (const id of professorIds.slice(0, 20)) {
    const blockReason = await getProfessorOutreachBlockReason(userId, id);
    if (blockReason) {
      if (blockReason === "draft_exists") {
        const existing = await prisma.draft.findFirst({
          where: {
            userId,
            professorId: id,
            status: {
              in: ["pending", "pending_review", "scheduled", "approved"],
            },
          },
          orderBy: { updatedAt: "desc" },
        });
        if (existing) {
          created.push(existing);
          continue;
        }
      }
      skipped.push({ professorId: id, reason: blockReason });
      continue;
    }
    const professor = await prisma.professor.findFirst({
      where: { id, userId },
      select: { email: true, emailVerified: true, name: true },
    });
    if (!professor?.email || !professor.emailVerified) {
      skipped.push({
        professorId: id,
        reason: `No verified email for ${professor?.name || id}`,
      });
      continue;
    }
    try {
      const result = await generatePersonalizedDraft({
        userId,
        professorId: id,
      });
      created.push(result.draft);
    } catch (err) {
      skipped.push({
        professorId: id,
        reason: err instanceof Error ? err.message : "Draft failed",
      });
    }
  }
  return { drafts: created, skipped };
}
