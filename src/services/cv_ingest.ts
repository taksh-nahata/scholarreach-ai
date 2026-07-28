import { prisma } from "@/lib/prisma";
import {
  compileProfileBrief,
  ensureProfile,
  parseJsonField,
} from "@/services/profile_service";

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

async function callLlm(prompt: string): Promise<string | null> {
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
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Extract structured student profile data from resume/CV text. Return ONLY valid JSON.",
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

function heuristicExtract(text: string): ExtractedProfile {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const email = text.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0];
  const github = text.match(/github\.com\/[\w-]+/i)?.[0];
  const linkedin = text.match(/linkedin\.com\/in\/[\w-]+/i)?.[0];
  const gpa = text.match(/\b\d\.\d{1,2}\s*GPA\b/i)?.[0];

  const achievements: Array<Record<string, unknown>> = [];
  for (const line of lines) {
    if (
      /(champion|award|place|selected|intern|founder|lead|published|olympiad)/i.test(
        line
      ) &&
      line.length > 24 &&
      line.length < 280
    ) {
      achievements.push({ title: line.slice(0, 120), detail: line });
    }
  }

  return {
    displayName: lines[0]?.length < 80 ? lines[0] : undefined,
    school: lines.find((l) => /(university|college|high school|school)/i.test(l)),
    location: lines.find((l) => /(, [A-Z]{2}\b|California|CA\b)/.test(l)),
    phone: text.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/)?.[0],
    githubUrl: github ? `https://${github.replace(/^https?:\/\//, "")}` : undefined,
    linkedinUrl: linkedin
      ? `https://${linkedin.replace(/^https?:\/\//, "")}`
      : undefined,
    education: email
      ? [{ school: lines.find((l) => /school|college|university/i.test(l)), gpa }]
      : [],
    achievements: achievements.slice(0, 10),
    projects: [],
    skills: {},
    researchInterests: undefined,
  };
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

export async function extractTextFromUpload(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const lower = fileName.toLowerCase();
  if (
    mimeType.includes("text") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md")
  ) {
    return buffer.toString("utf8");
  }

  if (mimeType.includes("pdf") || lower.endsWith(".pdf")) {
    // pdf-parse is CJS
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (b: Buffer) => Promise<{ text: string }>;
    const parsed = await pdfParse(buffer);
    return parsed.text || "";
  }

  // Fallback: attempt utf8
  return buffer.toString("utf8");
}

export async function ingestCvForUser(opts: {
  userId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const text = (await extractTextFromUpload(
    opts.buffer,
    opts.mimeType,
    opts.fileName
  )).trim();
  if (!text || text.length < 40) {
    throw new Error("Could not read enough text from that file. Try PDF or paste text.");
  }

  const llmRaw = await callLlm(
    `Extract this student's profile as JSON with keys:
displayName, headline, school, gradeOrYear, location, phone, githubUrl, linkedinUrl,
education (array of {school, degree, years, gpa, coursework}),
achievements (array of {title, detail, year}),
projects (array of {name, role, details}),
skills ({languages, frameworks, expertise}),
researchInterests (string).

CV text:
"""
${text.slice(0, 12000)}
"""`
  );

  const extracted = safeParseExtract(llmRaw) || heuristicExtract(text);
  await ensureProfile(opts.userId);

  const brief = compileProfileBrief({
    ...extracted,
    cvText: text,
    targetRegions: [],
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
      educationJson: extracted.education
        ? JSON.stringify(extracted.education)
        : undefined,
      achievementsJson: extracted.achievements
        ? JSON.stringify(extracted.achievements)
        : undefined,
      projectsJson: extracted.projects
        ? JSON.stringify(extracted.projects)
        : undefined,
      skillsJson: extracted.skills ? JSON.stringify(extracted.skills) : undefined,
      researchInterests: extracted.researchInterests || undefined,
      cvFileName: opts.fileName,
      cvMimeType: opts.mimeType,
      cvText: text,
      cvUploadedAt: new Date(),
      onboardingStep: "interview",
      profileBrief: brief,
    },
  });

  if (extracted.displayName) {
    await prisma.user.update({
      where: { id: opts.userId },
      data: { name: extracted.displayName },
    });
  }

  return {
    profile,
    extracted,
    preview: text.slice(0, 600),
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
