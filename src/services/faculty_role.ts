/**
 * Faculty role classification + outreach tone rules.
 * Titles drive greeting, length, and ask style — not one generic "Dear Dr." email.
 */

export type FacultyRole =
  | "full_professor"
  | "associate_professor"
  | "assistant_professor"
  | "principal_investigator"
  | "research_scientist"
  | "lecturer"
  | "postdoc"
  | "student"
  | "unknown";

const ROLE_LABEL: Record<FacultyRole, string> = {
  full_professor: "Professor",
  associate_professor: "Associate Professor",
  assistant_professor: "Assistant Professor",
  principal_investigator: "Principal Investigator",
  research_scientist: "Research Scientist",
  lecturer: "Lecturer",
  postdoc: "Postdoctoral Researcher",
  student: "Student",
  unknown: "Faculty",
};

/** True if we should mine / email this person as a faculty target. */
export function isOutreachTargetRole(role: FacultyRole): boolean {
  return (
    role === "full_professor" ||
    role === "associate_professor" ||
    role === "assistant_professor" ||
    role === "principal_investigator" ||
    role === "research_scientist" ||
    role === "lecturer" ||
    role === "unknown"
  );
}

export function classifyFacultyTitle(
  title?: string | null,
  extras?: { labName?: string | null; worksCount?: number | null }
): FacultyRole {
  const t = (title || "").toLowerCase().trim();
  const lab = (extras?.labName || "").toLowerCase();

  if (
    /\b(ph\.?\s*d\.?\s*student|doctoral student|graduate student|undergrad|undergraduate|masters student|m\.?s\.?\s*student)\b/i.test(
      t
    )
  ) {
    return "student";
  }
  if (/\b(post[- ]?doc|postdoctoral)\b/i.test(t)) return "postdoc";

  // Order matters: assistant/associate before bare "professor"
  if (/\bassistant\s+professor\b|\basst\.?\s*prof\b/i.test(t)) {
    return "assistant_professor";
  }
  if (/\bassociate\s+professor\b|\bassoc\.?\s*prof\b/i.test(t)) {
    return "associate_professor";
  }
  if (
    /\b(distinguished|endowed|chaired|university|regents'|named)\s+professor\b/i.test(
      t
    ) ||
    /\bfull\s+professor\b/i.test(t) ||
    (/^professor\b/i.test(t) && !/assistant|associate/i.test(t)) ||
    /\bprofessor\b/i.test(t)
  ) {
    // bare "Professor" → full
    if (/\bassistant\b/i.test(t)) return "assistant_professor";
    if (/\bassociate\b/i.test(t)) return "associate_professor";
    return "full_professor";
  }

  if (
    /\bprincipal\s+investigator\b/i.test(t) ||
    /(^|[^a-z])pi([^a-z]|$)/i.test(t) ||
    /\blab\s+director\b|\bgroup\s+leader\b/i.test(t) ||
    (/director/.test(lab) && /lab|group/.test(lab))
  ) {
    return "principal_investigator";
  }

  if (
    /\bresearch\s+(scientist|engineer|associate|fellow)\b|\bstaff\s+scientist\b/i.test(
      t
    )
  ) {
    return "research_scientist";
  }
  if (/\b(lecturer|instructor|teaching\s+professor|adjunct)\b/i.test(t)) {
    return "lecturer";
  }

  // Soft infer: high publication count + lab name → treat as PI-ish faculty
  if ((extras?.worksCount || 0) >= 40 && lab) return "principal_investigator";

  return "unknown";
}

export function normalizeTitleForStorage(
  title?: string | null,
  role?: FacultyRole
): string {
  const r = role || classifyFacultyTitle(title);
  const raw = (title || "").trim();
  if (raw && raw.length > 3 && r !== "unknown") {
    // Keep specific title if present
    return raw.replace(/\s+/g, " ");
  }
  return ROLE_LABEL[r];
}

export function roleDisplayLabel(role: FacultyRole): string {
  return ROLE_LABEL[role];
}

/** Salutation line — differs by rank. */
export function roleGreeting(role: FacultyRole, lastName: string): string {
  switch (role) {
    case "full_professor":
    case "associate_professor":
      return `Dear Professor ${lastName},`;
    case "assistant_professor":
      // Newer faculty: Dr. is common and respectful without over-formality
      return `Dear Dr. ${lastName},`;
    case "principal_investigator":
      return `Dear Dr. ${lastName},`;
    case "research_scientist":
    case "lecturer":
      return `Dear Dr. ${lastName},`;
    default:
      return `Dear Dr. ${lastName},`;
  }
}

/**
 * LLM / template guidance so each role gets a different email shape.
 */
export function roleEmailGuidance(role: FacultyRole): string {
  switch (role) {
    case "full_professor":
      return [
        "ROLE: Full / senior Professor.",
        "Tone: highly respectful, concise, no casual slang.",
        "Length: short but complete (~180–220 words). Cover why-them, offer, time, goals — no fluff.",
        "Open by naming ONE specific paper/result, then 1–2 student bullets max.",
        "Ask: brief exploratory note or pointer to the right person in the group — not a long volunteer pitch.",
        "Do NOT oversell or sound entitled. No 'I would be a great fit for every project'.",
      ].join("\n");
    case "associate_professor":
      return [
        "ROLE: Associate Professor (mid-career).",
        "Tone: warm-professional, curious about their current agenda.",
        "Length: ~180–200 words.",
        "Connect student skills to a concrete thread in their recent work.",
        "Ask: short call or volunteer contribution on a current project.",
        "Acknowledge they likely run an active lab — be specific about how you help.",
      ].join("\n");
    case "assistant_professor":
      return [
        "ROLE: Assistant Professor (building a lab).",
        "Tone: energetic, helpful, respectful — they are hiring capacity.",
        "Length: ~190–210 words.",
        "Emphasize reliability, hours you can give, and concrete skills that reduce lab load.",
        "Ask: volunteer / research assistant contribution this term (even a few hours/week).",
        "Avoid talking down or assuming their lab is already huge.",
      ].join("\n");
    case "principal_investigator":
      return [
        "ROLE: Principal Investigator / lab director (may or may not be tenure-line).",
        "Tone: lab- and project-focused.",
        "Address their GROUP / LAB work, not just 'your teaching'.",
        "Length: ~180–200 words.",
        "Ask how you could support an ongoing project or open role in the group.",
        "Greeting uses Dr.; body may say 'your lab' / 'your group' naturally.",
      ].join("\n");
    case "research_scientist":
      return [
        "ROLE: Research scientist / staff researcher.",
        "Tone: collaborative peer-curious (still student→mentor).",
        "Focus on methods, systems, or papers — less 'join your course'.",
        "Ask for a short chat about contributing to a technical project.",
      ].join("\n");
    case "lecturer":
      return [
        "ROLE: Lecturer / teaching-focused faculty.",
        "Tone: respectful; lighter research ask unless they clearly publish.",
        "If research focus is thin, emphasize learning / project mentorship carefully.",
        "Do not assume they run a large funded lab.",
      ].join("\n");
    default:
      return [
        "ROLE: Faculty (rank unclear).",
        "Tone: warm-professional default.",
        "Use Dr. greeting; keep under 200 words; specific paper cite; soft ask.",
      ].join("\n");
  }
}

/** Subject-line hint — clear "Prospective … Student" style. */
export function roleSubjectHint(
  role: FacultyRole,
  university: string,
  studentName: string
): string {
  const first = studentName.split(/\s+/)[0] || studentName;
  void role;
  void university;
  return `Prospective Research Student — ${first}`;
}

/** Infer a best-effort title string from OpenAlex-ish signals when page title is missing. */
export function inferTitleFromSignals(opts: {
  worksCount?: number | null;
  labName?: string | null;
  existingTitle?: string | null;
}): string {
  if (opts.existingTitle?.trim()) {
    return normalizeTitleForStorage(opts.existingTitle);
  }
  const wc = opts.worksCount || 0;
  if (opts.labName && wc >= 25) return "Principal Investigator";
  if (wc >= 80) return "Professor";
  if (wc >= 25) return "Associate Professor";
  if (wc >= 8) return "Assistant Professor";
  return "Faculty";
}
