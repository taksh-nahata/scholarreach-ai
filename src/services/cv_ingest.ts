import { prisma } from "@/lib/prisma";
import {
  compileProfileBrief,
  ensureProfile,
  parseJsonField,
} from "@/services/profile_service";
import { detectCredentialDocType } from "@/services/doc_type";
import { extractTextFromUpload } from "@/services/cv_text_extract";
import {
  cleanLocation,
  mergeParsedCv,
  parseCvStructured,
  parseRichness,
  type ParsedCv,
} from "@/services/cv_structured_parse";

export { extractTextFromUpload };

type ExtractedProfile = {
  displayName?: string;
  headline?: string;
  school?: string;
  gradeOrYear?: string;
  location?: string;
  phone?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  education?: Array<Record<string, unknown>>;
  achievements?: Array<Record<string, unknown>>;
  projects?: Array<Record<string, unknown>>;
  skills?: Record<string, unknown>;
  researchInterests?: string;
};

async function callLlmExtract(text: string): Promise<ExtractedProfile | null> {
  try {
    const { completePrompt } = await import("@/services/llm_client");
    const llmRaw = await completePrompt({
      system:
        "Extract structured student profile data from resume/CV text. Return ONLY valid JSON. Keep every experience, project, award, and skill listed.",
      user: `Extract this student's profile as JSON with keys:
displayName, headline, school, gradeOrYear, location (city/state only), phone, githubUrl, linkedinUrl,
education (array of {school, degree, years, gpa, coursework}),
achievements (array of {title, detail, year}) — from HONORS/AWARDS,
projects (array of {name, role, details, tags}) — include BOTH research/work experience entries AND featured projects; name = lab/org/project title,
skills ({languages: string[], frameworks: string[], expertise: string[]}),
researchInterests (string).

CV text:
"""
${text.slice(0, 14000)}
"""`,
      task: "extract",
    });
    return safeParseExtract(llmRaw);
  } catch {
    return null;
  }
}

function safeParseExtract(raw: string | null): ExtractedProfile | null {
  if (!raw) return null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as ExtractedProfile;
  } catch {
    return null;
  }
}

function asParsed(e: ExtractedProfile | null | undefined): ParsedCv | null {
  if (!e) return null;
  const skills = (e.skills || {}) as {
    languages?: string[];
    frameworks?: string[];
    expertise?: string[];
  };
  return {
    displayName: e.displayName,
    headline: e.headline,
    school: e.school,
    gradeOrYear: e.gradeOrYear,
    location: cleanLocation(e.location),
    phone: e.phone,
    githubUrl: e.githubUrl,
    linkedinUrl: e.linkedinUrl,
    education: Array.isArray(e.education) ? e.education : [],
    achievements: Array.isArray(e.achievements)
      ? e.achievements.map((a) => ({
          title: String((a as { title?: string }).title || ""),
          detail: String(
            (a as { detail?: string }).detail ||
              (a as { title?: string }).title ||
              ""
          ),
        }))
      : [],
    projects: Array.isArray(e.projects)
      ? e.projects.map((p) => ({
          name: String((p as { name?: string }).name || ""),
          role: (p as { role?: string }).role
            ? String((p as { role?: string }).role)
            : undefined,
          details: String(
            (p as { details?: string }).details ||
              (p as { name?: string }).name ||
              ""
          ),
          tags: Array.isArray((p as { tags?: string[] }).tags)
            ? (p as { tags: string[] }).tags
            : undefined,
        }))
      : [],
    skills: {
      languages: Array.isArray(skills.languages) ? skills.languages : [],
      frameworks: Array.isArray(skills.frameworks) ? skills.frameworks : [],
      expertise: Array.isArray(skills.expertise) ? skills.expertise : [],
    },
    researchInterests: e.researchInterests,
  };
}

function existingAsParsed(existing: {
  displayName?: string | null;
  headline?: string | null;
  school?: string | null;
  gradeOrYear?: string | null;
  location?: string | null;
  phone?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  educationJson?: string | null;
  achievementsJson?: string | null;
  projectsJson?: string | null;
  skillsJson?: string | null;
  researchInterests?: string | null;
} | null): ParsedCv | null {
  if (!existing) return null;
  const skills = parseJsonField(existing.skillsJson, {
    languages: [],
    frameworks: [],
    expertise: [],
  }) as ParsedCv["skills"];
  return {
    displayName: existing.displayName || undefined,
    headline: existing.headline || undefined,
    school: existing.school || undefined,
    gradeOrYear: existing.gradeOrYear || undefined,
    location: cleanLocation(existing.location),
    phone: existing.phone || undefined,
    githubUrl: existing.githubUrl || undefined,
    linkedinUrl: existing.linkedinUrl || undefined,
    education: parseJsonField(existing.educationJson, []),
    achievements: parseJsonField(existing.achievementsJson, []),
    projects: parseJsonField(existing.projectsJson, []),
    skills: {
      languages: skills.languages || [],
      frameworks: skills.frameworks || [],
      expertise: skills.expertise || [],
    },
    researchInterests: existing.researchInterests || undefined,
  };
}

/** Prefer the richer of structured vs LLM; never keep empty over full. */
function pickBest(
  structured: ParsedCv,
  llm: ParsedCv | null,
  previous: ParsedCv | null
): ParsedCv {
  let best = structured;
  if (llm && parseRichness(llm) > parseRichness(best)) {
    best = mergeParsedCv(llm, structured);
  } else if (llm) {
    best = mergeParsedCv(structured, llm);
  }
  // If somehow still empty on a list the user previously had filled, keep previous
  if (previous) {
    if (!best.projects.length && previous.projects.length) {
      best = { ...best, projects: previous.projects };
    }
    if (!best.achievements.length && previous.achievements.length) {
      best = { ...best, achievements: previous.achievements };
    }
    if (
      !best.skills.languages.length &&
      !best.skills.frameworks.length &&
      previous.skills.languages.length + previous.skills.frameworks.length > 0
    ) {
      best = { ...best, skills: previous.skills };
    }
  }
  best.location = cleanLocation(best.location);
  return best;
}

export async function ingestCvForUser(opts: {
  userId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const text = (
    await extractTextFromUpload(opts.buffer, opts.mimeType, opts.fileName)
  ).trim();
  if (!text || text.length < 40) {
    throw new Error(
      "Could not read enough text from that file. Try PDF or paste text."
    );
  }

  await ensureProfile(opts.userId);
  const existing = await prisma.studentProfile.findUnique({
    where: { userId: opts.userId },
  });

  const structured = parseCvStructured(text);
  const llm = asParsed(await callLlmExtract(text));
  const previous = existingAsParsed(existing);
  const extracted = pickBest(structured, llm, previous);

  const brief = compileProfileBrief({
    displayName: extracted.displayName || existing?.displayName,
    headline: extracted.headline || existing?.headline,
    school: extracted.school || existing?.school,
    gradeOrYear: extracted.gradeOrYear || existing?.gradeOrYear,
    location: extracted.location || cleanLocation(existing?.location),
    education: extracted.education,
    achievements: extracted.achievements,
    projects: extracted.projects,
    skills: extracted.skills,
    researchInterests:
      extracted.researchInterests || existing?.researchInterests,
    writingStyleNotes: existing?.writingStyleNotes,
    tonePreference: existing?.tonePreference,
    customRules: existing?.customRules,
    targetRegions: parseJsonField(existing?.targetRegionsJson, [] as string[]),
    workModePref: existing?.workModePref,
    availabilityNotes: existing?.availabilityNotes,
    cvText: text,
  });

  const profile = await prisma.studentProfile.update({
    where: { userId: opts.userId },
    data: {
      displayName: extracted.displayName || undefined,
      headline: extracted.headline || undefined,
      school: extracted.school || undefined,
      gradeOrYear: extracted.gradeOrYear || undefined,
      location: extracted.location || undefined,
      phone: extracted.phone || undefined,
      githubUrl: extracted.githubUrl || undefined,
      linkedinUrl: extracted.linkedinUrl || undefined,
      educationJson: JSON.stringify(extracted.education || []),
      achievementsJson: JSON.stringify(extracted.achievements || []),
      projectsJson: JSON.stringify(extracted.projects || []),
      skillsJson: JSON.stringify(extracted.skills || {}),
      researchInterests: extracted.researchInterests || undefined,
      cvFileName: opts.fileName,
      cvMimeType: opts.mimeType,
      cvText: text,
      cvFileData: opts.buffer.toString("base64"),
      cvUploadedAt: new Date(),
      attachCvToEmails: true,
      credentialDocType: detectCredentialDocType(opts.fileName, text),
      onboardingStep: existing?.onboardingStep === "done" ? "done" : "interview",
      profileBrief: brief,
    },
  });

  if (extracted.displayName) {
    await prisma.user.update({
      where: { id: opts.userId },
      data: { name: extracted.displayName },
    });
  }

  const detected = detectCredentialDocType(opts.fileName, text);
  const existingAtt = await prisma.profileAttachment.findFirst({
    where: { userId: opts.userId, fileName: opts.fileName },
  });
  if (!existingAtt) {
    await prisma.profileAttachment.create({
      data: {
        userId: opts.userId,
        label:
          detected === "resume"
            ? "Resume"
            : detected === "cv"
              ? "CV"
              : "Credentials",
        kind: "credential",
        fileName: opts.fileName,
        mimeType: opts.mimeType || "application/octet-stream",
        textExcerpt: text.slice(0, 4000),
        fileData: opts.buffer.toString("base64"),
        attachMode: "always",
        detectedDocType: detected,
      },
    });
  } else {
    await prisma.profileAttachment.update({
      where: { id: existingAtt.id },
      data: {
        textExcerpt: text.slice(0, 4000),
        fileData: opts.buffer.toString("base64"),
        mimeType: opts.mimeType || existingAtt.mimeType,
        detectedDocType: detected,
      },
    });
  }

  return {
    profile,
    extracted,
    preview: text.slice(0, 600),
    detectedDocType: detected,
    parseScore: parseRichness(extracted),
  };
}

export async function ingestCvText(userId: string, text: string) {
  const buffer = Buffer.from(text, "utf8");
  return ingestCvForUser({
    userId,
    fileName: "pasted-resume.txt",
    mimeType: "text/plain",
    buffer,
  });
}

/** Re-parse stored cvText without replacing the uploaded binary. */
export async function reparseStoredCv(userId: string) {
  const existing = await prisma.studentProfile.findUnique({
    where: { userId },
  });
  if (!existing?.cvText || existing.cvText.length < 40) {
    throw new Error("No stored CV text to reparse");
  }

  const text = existing.cvText;
  const structured = parseCvStructured(text);
  const llm = asParsed(await callLlmExtract(text));
  const previous = existingAsParsed(existing);
  const extracted = pickBest(structured, llm, previous);

  const brief = compileProfileBrief({
    displayName: extracted.displayName || existing.displayName,
    headline: extracted.headline || existing.headline,
    school: extracted.school || existing.school,
    gradeOrYear: extracted.gradeOrYear || existing.gradeOrYear,
    location: extracted.location || cleanLocation(existing.location),
    education: extracted.education,
    achievements: extracted.achievements,
    projects: extracted.projects,
    skills: extracted.skills,
    researchInterests:
      extracted.researchInterests || existing.researchInterests,
    writingStyleNotes: existing.writingStyleNotes,
    tonePreference: existing.tonePreference,
    customRules: existing.customRules,
    targetRegions: parseJsonField(existing.targetRegionsJson, [] as string[]),
    workModePref: existing.workModePref,
    availabilityNotes: existing.availabilityNotes,
    cvText: text,
  });

  const profile = await prisma.studentProfile.update({
    where: { userId },
    data: {
      displayName: extracted.displayName || undefined,
      headline: extracted.headline || undefined,
      school: extracted.school || undefined,
      gradeOrYear: extracted.gradeOrYear || undefined,
      location: extracted.location || undefined,
      phone: extracted.phone || undefined,
      githubUrl: extracted.githubUrl || undefined,
      linkedinUrl: extracted.linkedinUrl || undefined,
      educationJson: JSON.stringify(extracted.education || []),
      achievementsJson: JSON.stringify(extracted.achievements || []),
      projectsJson: JSON.stringify(extracted.projects || []),
      skillsJson: JSON.stringify(extracted.skills || {}),
      researchInterests: extracted.researchInterests || undefined,
      profileBrief: brief,
    },
  });

  return {
    profile,
    extracted,
    preview: text.slice(0, 600),
    parseScore: parseRichness(extracted),
  };
}

export function mergeInterviewIntoProfile(
  existingBrief: string | null | undefined,
  interview: Array<{ role: string; content: string }>
) {
  const answers = interview
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  if (!answers) return existingBrief || "";
  return `${existingBrief || ""}\n\nInterview notes:\n${answers}`.trim();
}

export { parseJsonField };
