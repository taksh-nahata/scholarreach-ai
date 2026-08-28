/**
 * Deterministic CV/resume section parser.
 * Prefer this over tiny LLM extracts — PDFs often have clear ALL-CAPS headers.
 */

export type ParsedCv = {
  displayName?: string;
  headline?: string;
  school?: string;
  gradeOrYear?: string;
  location?: string;
  phone?: string;
  email?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  education: Array<Record<string, unknown>>;
  achievements: Array<{ title: string; detail: string; year?: string }>;
  projects: Array<{
    name: string;
    role?: string;
    details: string;
    tags?: string[];
  }>;
  skills: {
    languages: string[];
    frameworks: string[];
    expertise: string[];
  };
  researchInterests?: string;
};

const SECTION_RE =
  /^(EDUCATION|TECHNICAL\s+SKILLS|SKILLS|RESEARCH\s*(?:&|AND)\s*WORK\s+EXPERIENCE|WORK\s+EXPERIENCE|EXPERIENCE|RESEARCH\s+EXPERIENCE|FEATURED\s+PROJECTS|PROJECTS|HONORS?\s*(?:&|AND)?\s*AWARDS?|AWARDS?|HONORS?|ACTIVITIES|LEADERSHIP)\s*$/i;

const ROLE_HINT =
  /^(research\s+intern|software\s+engineering\s+research\s+intern|founder|co-?founder|lead\s+developer|lead\s+programmer|hardware\s+designer|operations\s+lead|intern|research\s+assistant|undergraduate\s+researcher|software\s+engineer|developer|programmer)\b/i;

function normalizeCvText(raw: string): string {
  let t = raw
    .replace(/\u0000/g, "")
    // common PDF / mojibake fixes
    .replace(/â€™|�\?Ts|�\?T/g, "'")
    .replace(/â€"|â€”|�\?"|�\?"|–|—/g, "-")
    .replace(/â€¢|�\?�|•/g, "•")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ");

  // Join hyphenated line wraps: "Pre-\nCalculus" → "Pre-Calculus"
  t = t.replace(/(\w)-\n(\w)/g, "$1-$2");
  // Soft-join mid-sentence wraps when next line is lowercase / continuation
  t = t.replace(/([a-z,;:])\n([a-z])/g, "$1 $2");

  return t;
}

function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => {
      if (!l) return false;
      // Drop orphan bullet-only lines from bad PDF extracts
      if (/^[•\-*]+$/.test(l)) return false;
      return true;
    });
}

function sectionMap(lines: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  let current = "HEADER";
  map.set(current, []);
  for (const line of lines) {
    if (SECTION_RE.test(line)) {
      current = line.toUpperCase().replace(/\s+/g, " ");
      if (!map.has(current)) map.set(current, []);
      continue;
    }
    map.get(current)!.push(line);
  }
  return map;
}

function findSection(
  map: Map<string, string[]>,
  ...needles: RegExp[]
): string[] {
  for (const [key, lines] of map) {
    if (needles.some((n) => n.test(key))) return lines;
  }
  return [];
}

function splitCsvSkills(value: string): string[] {
  return value
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 80);
}

function parseSkills(lines: string[]): ParsedCv["skills"] {
  const blob = lines.join("\n");
  const languages: string[] = [];
  const frameworks: string[] = [];
  const expertise: string[] = [];

  const lang = blob.match(
    /Languages?\s*[:\-]\s*([^\n]+(?:\n(?![A-Z][a-z].*?:)[^\n]+)*)/i
  );
  const fw = blob.match(
    /Frameworks?(?:\s*&?\s*Tools?)?\s*[:\-]\s*([^\n]+(?:\n(?![A-Z][a-z].*?:)[^\n]+)*)/i
  );
  const core = blob.match(
    /(?:Core\s+Competenc(?:y|ies)|Competenc(?:y|ies)|Expertise)\s*[:\-]\s*([^\n]+(?:\n(?![A-Z][a-z].*?:)[^\n]+)*)/i
  );

  if (lang) languages.push(...splitCsvSkills(lang[1].replace(/\n/g, " ")));
  if (fw) frameworks.push(...splitCsvSkills(fw[1].replace(/\n/g, " ")));
  if (core) expertise.push(...splitCsvSkills(core[1].replace(/\n/g, " ")));

  // Fallback: unlabeled comma lists under skills
  if (!languages.length && !frameworks.length && lines.length) {
    for (const line of lines) {
      if (/:/.test(line)) continue;
      expertise.push(...splitCsvSkills(line));
    }
  }

  return {
    languages: unique(languages),
    frameworks: unique(frameworks),
    expertise: unique(expertise),
  };
}

function unique(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of arr) {
    const k = a.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

function looksLikeOrg(line: string): boolean {
  if (ROLE_HINT.test(line) && line.length < 60) return false;
  // Detail sentences usually start with a past-tense verb
  if (
    /^(Engineered|Developed|Programmed|Built|Architected|Managed|Selected|Formally|Co-founded|Wrote|Created|Designed|Implemented|Led|Ranked|Crowned)\b/i.test(
      line
    )
  ) {
    return false;
  }
  if (line.length > 110) return false;
  return (
    /\b(lab|university|college|institute|program|team|inc|llc|org|company|accelerator|poly|usc|cal\s*poly|aiea|vex|tech-?steps|services|boyz)\b/i.test(
      line
    ) ||
    /\(.*\)/.test(line) ||
    /\//.test(line) ||
    /tech-steps\.org/i.test(line) ||
    // Short title-ish line after a role is almost always the org
    (line.length < 90 && !/[.!?]$/.test(line) && /[A-Z]/.test(line[0] || ""))
  );
}

/** Parse Role / Org / detail-paragraphs blocks. */
function parseRoleBlocks(
  lines: string[]
): Array<{ role: string; org: string; details: string[] }> {
  const blocks: Array<{ role: string; org: string; details: string[] }> = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Role on its own line, org next
    if (ROLE_HINT.test(line) && i + 1 < lines.length && looksLikeOrg(lines[i + 1])) {
      const role = line;
      const org = lines[i + 1];
      i += 2;
      const details: string[] = [];
      while (i < lines.length && !ROLE_HINT.test(lines[i])) {
        // Stop if next role-like short title without continuing sentence
        details.push(lines[i].replace(/^[•\-*]\s*/, ""));
        i += 1;
      }
      blocks.push({ role, org, details: details.filter(Boolean) });
      continue;
    }
    // "Role — Org" single line
    const m = line.match(/^(.+?)\s+[—\-–]\s+(.+)$/);
    if (m && ROLE_HINT.test(m[1])) {
      const role = m[1].trim();
      const org = m[2].trim();
      i += 1;
      const details: string[] = [];
      while (i < lines.length && !ROLE_HINT.test(lines[i])) {
        details.push(lines[i].replace(/^[•\-*]\s*/, ""));
        i += 1;
      }
      blocks.push({ role, org, details: details.filter(Boolean) });
      continue;
    }
    i += 1;
  }
  return blocks;
}

function blockToProject(b: {
  role: string;
  org: string;
  details: string[];
}): ParsedCv["projects"][number] {
  const name = b.org.replace(/\s+/g, " ").trim();
  const details = b.details.join(" ").replace(/\s+/g, " ").trim();
  return {
    name,
    role: b.role,
    details: details || `${b.role} at ${name}`,
    tags: inferTags(`${name} ${b.role} ${details}`),
  };
}

function inferTags(blob: string): string[] {
  const t = blob.toLowerCase();
  const tags: string[] = [];
  const rules: Array<[RegExp, string[]]> = [
    [/python|fastapi/, ["python"]],
    [/c\+\+|firmware/, ["c++", "firmware"]],
    [/javascript|html|css|tailwind|gemini|gcp|cloud/, ["web", "javascript"]],
    [/carla|simulation|autonomous|vehicle/, ["simulation", "autonomous", "ai"]],
    [/opencv|vision|camera|hyperspectral/, ["vision", "cameras"]],
    [/robot|vex|sensor/, ["robotics", "sensors", "hardware"]],
    [/hardware|motor|sdk/, ["hardware", "systems"]],
    [/startup|pitch|accelerator|entrepreneur/, ["entrepreneurship"]],
  ];
  for (const [re, ts] of rules) {
    if (re.test(t)) tags.push(...ts);
  }
  return unique(tags);
}

function parseAwards(lines: string[]): ParsedCv["achievements"] {
  const out: ParsedCv["achievements"] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^[•\-*]\s*/, "").trim();
    if (cleaned.length < 12) continue;
    // Prefer "Title - Detail" or "Title — Detail"
    const parts = cleaned.split(/\s+[—\-–]\s+/);
    if (parts.length >= 2) {
      out.push({
        title: parts[0].trim(),
        detail: parts.slice(1).join(" - ").trim(),
      });
    } else {
      out.push({ title: cleaned.slice(0, 140), detail: cleaned });
    }
  }
  return out;
}

function parseEducation(lines: string[]): {
  education: ParsedCv["education"];
  school?: string;
  gradeOrYear?: string;
  headline?: string;
} {
  const school =
    lines.find((l) =>
      /(high school|college|university|academy)/i.test(l)
    ) || lines[0];
  const dual = lines.find((l) => /dual\s*enroll/i.test(l));
  const gpa = lines.find((l) => /gpa/i.test(l));
  const coursework = lines.find((l) => /coursework/i.test(l));
  const degree = dual || lines.find((l) => /associate|candidate|bachelor|degree/i.test(l));

  const education: ParsedCv["education"] = [
    {
      school,
      degree: degree || undefined,
      gpa: gpa?.replace(/^GPA:\s*/i, "") || undefined,
      coursework: coursework?.replace(/^Key Coursework:\s*/i, "") || undefined,
    },
  ];

  let gradeOrYear: string | undefined;
  let headline: string | undefined;
  if (dual) {
    gradeOrYear = "High school · Dual Enrollment";
    headline =
      "High school student dual-enrolled at community college · research & engineering";
  }

  return { education, school, gradeOrYear, headline };
}

function parseHeader(lines: string[]): Partial<ParsedCv> {
  const name = lines[0]?.length < 80 && !/@/.test(lines[0]) ? lines[0] : undefined;
  const contact = lines.find((l) => /@/.test(l) || /\d{3}/.test(l)) || "";
  const email = contact.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0];
  const phone = contact.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/)?.[0];
  // Prefer trailing "City, ST" on contact line
  const locMatch =
    contact.match(/\|\s*([^|]+,\s*[A-Z]{2})\s*$/) ||
    contact.match(/\b([A-Za-z .]+,\s*[A-Z]{2})\b/);
  const location = locMatch?.[1]?.trim();
  const github = lines
    .join(" ")
    .match(/github\.com\/[\w-]+/i)?.[0];
  const linkedin = lines
    .join(" ")
    .match(/linkedin\.com\/in\/[\w-]+/i)?.[0];

  return {
    displayName: name,
    email,
    phone,
    location,
    githubUrl: github
      ? `https://${github.replace(/^https?:\/\//, "")}`
      : undefined,
    linkedinUrl: linkedin
      ? `https://${linkedin.replace(/^https?:\/\//, "")}`
      : undefined,
  };
}

/** Score how complete a parse is (used to prefer structured over weak LLM). */
export function parseRichness(p: ParsedCv): number {
  return (
    (p.projects?.length || 0) * 3 +
    (p.achievements?.length || 0) * 2 +
    (p.skills?.languages?.length || 0) +
    (p.skills?.frameworks?.length || 0) +
    (p.skills?.expertise?.length || 0) +
    (p.education?.length ? 2 : 0)
  );
}

export function parseCvStructured(rawText: string): ParsedCv {
  const text = normalizeCvText(rawText);
  const lines = splitLines(text);
  const map = sectionMap(lines);

  const header = parseHeader(map.get("HEADER") || lines.slice(0, 4));
  const eduLines = findSection(map, /^EDUCATION$/);
  const skillLines = findSection(map, /SKILL/);
  const expLines = findSection(
    map,
    /EXPERIENCE/,
    /RESEARCH\s*(?:&|AND)\s*WORK/
  );
  const projectLines = findSection(map, /PROJECT/);
  const awardLines = findSection(map, /HONOR|AWARD/);

  const edu = parseEducation(eduLines);
  const skills = parseSkills(skillLines);

  const expBlocks = parseRoleBlocks(expLines);
  const projBlocks = parseRoleBlocks(projectLines);

  const projects = [
    ...expBlocks.map(blockToProject),
    ...projBlocks.map(blockToProject),
  ];

  // Dedupe projects by org/name similarity
  const seen = new Set<string>();
  const dedupedProjects = projects.filter((p) => {
    const key = p.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const achievements = parseAwards(awardLines);

  // Interests hint from skills + labs
  const researchInterests = [
    skills.expertise.slice(0, 4).join(", "),
    dedupedProjects
      .slice(0, 2)
      .map((p) => p.name)
      .join("; "),
  ]
    .filter(Boolean)
    .join(". ");

  return {
    ...header,
    school: edu.school,
    gradeOrYear: edu.gradeOrYear,
    headline: edu.headline,
    education: edu.education,
    skills,
    projects: dedupedProjects,
    achievements,
    researchInterests: researchInterests || undefined,
  };
}

/** Merge two parses — prefer non-empty richer fields; never wipe with empty. */
export function mergeParsedCv(
  primary: ParsedCv,
  secondary?: Partial<ParsedCv> | null
): ParsedCv {
  if (!secondary) return primary;
  const skills = {
    languages:
      primary.skills.languages.length > 0
        ? primary.skills.languages
        : secondary.skills?.languages || [],
    frameworks:
      primary.skills.frameworks.length > 0
        ? primary.skills.frameworks
        : secondary.skills?.frameworks || [],
    expertise:
      primary.skills.expertise.length > 0
        ? primary.skills.expertise
        : secondary.skills?.expertise || [],
  };
  return {
    displayName: primary.displayName || secondary.displayName,
    headline: primary.headline || secondary.headline,
    school: primary.school || secondary.school,
    gradeOrYear: primary.gradeOrYear || secondary.gradeOrYear,
    location: cleanLocation(primary.location || secondary.location),
    phone: primary.phone || secondary.phone,
    email: primary.email || secondary.email,
    githubUrl: primary.githubUrl || secondary.githubUrl,
    linkedinUrl: primary.linkedinUrl || secondary.linkedinUrl,
    education:
      primary.education.length > 0
        ? primary.education
        : secondary.education || [],
    achievements:
      primary.achievements.length > 0
        ? primary.achievements
        : (secondary.achievements as ParsedCv["achievements"]) || [],
    projects:
      primary.projects.length > 0
        ? primary.projects
        : (secondary.projects as ParsedCv["projects"]) || [],
    skills,
    researchInterests:
      primary.researchInterests || secondary.researchInterests,
  };
}

export function cleanLocation(loc?: string | null): string | undefined {
  if (!loc) return undefined;
  // Strip phone/email junk that sometimes lands in location
  const cityState = loc.match(/\b([A-Za-z .]+,\s*[A-Z]{2})\b/);
  if (cityState) return cityState[1].trim();
  if (/@|\d{3}[-.\s]?\d{3}/.test(loc)) return undefined;
  return loc.trim();
}
