import { prisma } from "@/lib/prisma";
import { regionLabel } from "@/lib/regions";

export type ProfilePayload = {
  displayName?: string | null;
  headline?: string | null;
  phone?: string | null;
  location?: string | null;
  school?: string | null;
  gradeOrYear?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  personalSite?: string | null;
  education?: unknown;
  achievements?: unknown;
  projects?: unknown;
  skills?: unknown;
  writingSamples?: unknown;
  writingStyleNotes?: string | null;
  tonePreference?: string | null;
  targetRegions?: string[];
  workModePref?: string | null;
  researchInterests?: string | null;
  availabilityNotes?: string | null;
  onboardingStep?: string;
  interviewComplete?: boolean;
  onboardingComplete?: boolean;
};

function asJson(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function parseJsonField<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function compileProfileBrief(input: {
  displayName?: string | null;
  headline?: string | null;
  school?: string | null;
  gradeOrYear?: string | null;
  location?: string | null;
  education?: unknown;
  achievements?: unknown;
  projects?: unknown;
  skills?: unknown;
  researchInterests?: string | null;
  writingStyleNotes?: string | null;
  tonePreference?: string | null;
  targetRegions?: string[];
  workModePref?: string | null;
  availabilityNotes?: string | null;
  cvText?: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`Name: ${input.displayName || "Student researcher"}`);
  if (input.headline) lines.push(`Headline: ${input.headline}`);
  if (input.school) lines.push(`School: ${input.school}`);
  if (input.gradeOrYear) lines.push(`Year/status: ${input.gradeOrYear}`);
  if (input.location) lines.push(`Location: ${input.location}`);
  if (input.researchInterests) lines.push(`Research interests: ${input.researchInterests}`);
  if (input.workModePref) lines.push(`Work mode preference: ${input.workModePref}`);
  if (input.availabilityNotes) lines.push(`Availability: ${input.availabilityNotes}`);
  if (input.tonePreference) lines.push(`Tone: ${input.tonePreference}`);
  if (input.writingStyleNotes) lines.push(`Writing style: ${input.writingStyleNotes}`);
  if (input.targetRegions?.length) {
    lines.push(
      `Target regions: ${input.targetRegions.map(regionLabel).join(", ")}`
    );
  }

  const edu = Array.isArray(input.education) ? input.education : [];
  if (edu.length) {
    lines.push("Education:");
    for (const e of edu.slice(0, 8) as Array<Record<string, unknown>>) {
      lines.push(
        `- ${e.school || e.institution || "School"}${e.degree ? ` · ${e.degree}` : ""}${e.gpa ? ` · ${e.gpa}` : ""}`
      );
    }
  }

  const achievements = Array.isArray(input.achievements) ? input.achievements : [];
  if (achievements.length) {
    lines.push("Achievements:");
    for (const a of achievements.slice(0, 12) as Array<Record<string, unknown>>) {
      lines.push(`- ${a.title || a.name}${a.detail ? `: ${a.detail}` : ""}`);
    }
  }

  const projects = Array.isArray(input.projects) ? input.projects : [];
  if (projects.length) {
    lines.push("Projects / research:");
    for (const p of projects.slice(0, 10) as Array<Record<string, unknown>>) {
      lines.push(
        `- ${p.name}${p.role ? ` (${p.role})` : ""}${p.details ? `: ${p.details}` : ""}`
      );
    }
  }

  const skills = (input.skills || {}) as Record<string, unknown>;
  if (skills && typeof skills === "object") {
    const asList = (v: unknown): string[] => {
      if (Array.isArray(v)) return v.map(String);
      if (typeof v === "string") {
        try {
          const parsed = JSON.parse(v);
          return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          return v ? [v] : [];
        }
      }
      return [];
    };
    const langs = asList(skills.languages);
    const frameworks = asList(skills.frameworks || skills.frameworks_and_libraries);
    const expertise = asList(skills.expertise);
    if (langs.length || frameworks.length || expertise.length) {
      lines.push("Skills:");
      if (langs.length) lines.push(`- Languages: ${langs.join(", ")}`);
      if (frameworks.length) lines.push(`- Tools/frameworks: ${frameworks.join(", ")}`);
      if (expertise.length) lines.push(`- Expertise: ${expertise.join(", ")}`);
    }
  }

  if (input.cvText) {
    lines.push("CV excerpt:");
    lines.push(input.cvText.slice(0, 2500));
  }

  return lines.join("\n");
}

export async function ensureProfile(userId: string) {
  return prisma.studentProfile.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

export async function getProfileBundle(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!user) return null;
  const p = user.profile;
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      onboardingComplete: user.onboardingComplete,
      gmailConnected: user.gmailConnected,
    },
    profile: p
      ? {
          ...p,
          education: parseJsonField(p.educationJson, []),
          achievements: parseJsonField(p.achievementsJson, []),
          projects: parseJsonField(p.projectsJson, []),
          skills: parseJsonField(p.skillsJson, {}),
          writingSamples: parseJsonField(p.writingSamplesJson, []),
          targetRegions: parseJsonField(p.targetRegionsJson, [] as string[]),
          interview: parseJsonField(p.interviewJson, [] as Array<{ role: string; content: string; at?: string }>),
        }
      : null,
  };
}

export async function updateProfile(userId: string, payload: ProfilePayload) {
  await ensureProfile(userId);
  const existing = await prisma.studentProfile.findUnique({ where: { userId } });

  const education = payload.education ?? parseJsonField(existing?.educationJson, []);
  const achievements =
    payload.achievements ?? parseJsonField(existing?.achievementsJson, []);
  const projects = payload.projects ?? parseJsonField(existing?.projectsJson, []);
  const skills = payload.skills ?? parseJsonField(existing?.skillsJson, {});
  const writingSamples =
    payload.writingSamples ?? parseJsonField(existing?.writingSamplesJson, []);
  const targetRegions =
    payload.targetRegions ?? parseJsonField(existing?.targetRegionsJson, [] as string[]);

  const brief = compileProfileBrief({
    displayName: payload.displayName ?? existing?.displayName,
    headline: payload.headline ?? existing?.headline,
    school: payload.school ?? existing?.school,
    gradeOrYear: payload.gradeOrYear ?? existing?.gradeOrYear,
    location: payload.location ?? existing?.location,
    education,
    achievements,
    projects,
    skills,
    researchInterests: payload.researchInterests ?? existing?.researchInterests,
    writingStyleNotes: payload.writingStyleNotes ?? existing?.writingStyleNotes,
    tonePreference: payload.tonePreference ?? existing?.tonePreference,
    targetRegions,
    workModePref: payload.workModePref ?? existing?.workModePref,
    availabilityNotes: payload.availabilityNotes ?? existing?.availabilityNotes,
    cvText: existing?.cvText,
  });

  const profile = await prisma.studentProfile.update({
    where: { userId },
    data: {
      displayName: payload.displayName ?? undefined,
      headline: payload.headline ?? undefined,
      phone: payload.phone ?? undefined,
      location: payload.location ?? undefined,
      school: payload.school ?? undefined,
      gradeOrYear: payload.gradeOrYear ?? undefined,
      githubUrl: payload.githubUrl ?? undefined,
      linkedinUrl: payload.linkedinUrl ?? undefined,
      personalSite: payload.personalSite ?? undefined,
      educationJson: asJson(education) ?? undefined,
      achievementsJson: asJson(achievements) ?? undefined,
      projectsJson: asJson(projects) ?? undefined,
      skillsJson: asJson(skills) ?? undefined,
      writingSamplesJson: asJson(writingSamples) ?? undefined,
      writingStyleNotes: payload.writingStyleNotes ?? undefined,
      tonePreference: payload.tonePreference ?? undefined,
      targetRegionsJson: asJson(targetRegions) ?? undefined,
      workModePref: payload.workModePref ?? undefined,
      researchInterests: payload.researchInterests ?? undefined,
      availabilityNotes: payload.availabilityNotes ?? undefined,
      onboardingStep: payload.onboardingStep ?? undefined,
      interviewComplete: payload.interviewComplete ?? undefined,
      profileBrief: brief,
    },
  });

  if (payload.onboardingComplete) {
    await prisma.user.update({
      where: { id: userId },
      data: { onboardingComplete: true },
    });
  }

  if (payload.displayName) {
    await prisma.user.update({
      where: { id: userId },
      data: { name: payload.displayName },
    });
  }

  return profile;
}
