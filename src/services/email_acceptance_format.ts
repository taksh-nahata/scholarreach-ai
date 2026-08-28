/**
 * High-acceptance outreach email outline.
 * Based on mentor guidance: why them, what you offer, intensity, goals, local fit.
 * Keep readable — short paragraphs, no fluff.
 */

export type AcceptanceChecklist = {
  clearSubject: boolean;
  whyThisPerson: boolean;
  specificPaperOrWork: boolean;
  studentIdentityClear: boolean;
  whatYouOffer: boolean;
  specialSkillsOrFocus: boolean;
  timeIntensity: boolean;
  goals: boolean;
  localOrWorkMode: boolean;
  softAsk: boolean;
  attachmentOk: boolean;
  simpleReadable: boolean;
  score: number;
  missing: string[];
};

export function outreachSubjectHint(opts: {
  season?: "summer" | "school_year" | "either";
  studentName: string;
  university?: string | null;
}): string {
  const first = opts.studentName.split(/\s+/)[0] || opts.studentName;
  if (opts.season === "summer") {
    return `Prospective Summer Student — ${first}`;
  }
  if (opts.season === "school_year") {
    return `Prospective Research Student (school year) — ${first}`;
  }
  return `Prospective Research Student — ${first}`;
}

/** Human-readable availability + work-mode paragraph (formal; never dumps internal rules). */
export function intensityLine(opts: {
  availabilityNotes?: string | null;
  workModeLabel: string;
  defaultHours?: string;
}): string {
  const hours = formalizeAvailabilityHours(
    opts.availabilityNotes,
    opts.defaultHours
  );
  const mode = formalWorkModeSentence(opts.workModeLabel);
  return `${hours} ${mode}`;
}

/** Turn raw profile notes into a clean formal hours sentence. */
export function formalizeAvailabilityHours(
  notes?: string | null,
  defaultHours?: string
): string {
  let raw = (notes || "").trim();
  // Strip leaked internal drafting instructions if they ever got saved into notes
  raw = raw
    .replace(/\blocation-based:[\s\S]*$/i, "")
    .replace(/\bIf distance is unknown[\s\S]*$/i, "")
    .replace(/\bopen to hybrid if[\s\S]*$/i, "")
    .replace(/\bstudent school area:[\s\S]*$/i, "")
    .replace(
      /\bJust let me know about your preferences[\s\S]*$/i,
      ""
    )
    .replace(/\band I can try to adjust around it\.?/gi, "")
    .replace(/[,\s.]+$/g, "")
    .trim();

  if (raw.length > 12) {
    // Already a full sentence?
    if (/^I\s+(am|can|will)\b/i.test(raw)) {
      const sentence = raw
        .replace(/\s*\(purely volunteer\)/gi, " on a volunteer basis")
        .replace(
          /\s+and am open to an? even longer stretch if the project needs it\.?/gi,
          ", and I can increase that commitment if the project requires it"
        )
        .replace(
          /\s+and am open to a fuller summer stretch if the project needs it\.?/gi,
          ", and I can increase that commitment over the summer if useful"
        )
        .replace(/\s+,/g, ",")
        .replace(/\s{2,}/g, " ")
        .trim();
      return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
    }
    // Hours fragment → full sentence
    if (/\bhours?\b/i.test(raw) || /\b\d+\s*hrs?\b/i.test(raw)) {
      const cleaned = raw
        .replace(/^\s*about\s+/i, "about ")
        .replace(/\s*\(purely volunteer\)/i, " on a volunteer basis")
        .replace(/;\s*open to a fuller summer stretch if the project needs it/i,
          ", and I can increase that commitment over the summer if useful")
        .replace(/;\s*open to an? even longer stretch if the project needs it/i,
          ", and I can increase that commitment if the project requires it");
      if (/^I\s+/i.test(cleaned)) {
        return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
      }
      return `I am available for ${cleaned.replace(/^about\s+/i, "about ")}.`.replace(
        /\.\.+$/,
        "."
      );
    }
  }

  const hours =
    defaultHours ||
    "about 8-12 hours per week during the school year, and more intensively over summer if useful";
  return `I am available for ${hours}.`;
}

/** Formal work-mode sentence for the email body (not internal instructions). */
export function formalWorkModeSentence(workModeLabel: string): string {
  const m = (workModeLabel || "remote").toLowerCase();
  if (m.includes("location-based") || m.includes("if distance")) {
    // Safety net: never paste decision rules into the email
    return "I am available to contribute remotely.";
  }
  if (m.includes("flex")) {
    return "I am flexible regarding remote or in-person arrangements.";
  }
  if (m.includes("hybrid")) {
    return "I am open to hybrid collaboration (primarily remote, with occasional in-person meetings if useful).";
  }
  if (m.includes("person") || m.includes("local")) {
    return "I am available for in-person work.";
  }
  return "I am available to contribute remotely.";
}

/** Reject DOI slugs / garbage "paper" titles. */
export function isUsablePaperTitle(title?: string | null): boolean {
  const t = (title || "").trim();
  if (t.length < 18) return false;
  // Nature/Springer article ids, DOIs, URLs
  if (/^s?\d{4,}[-._]/i.test(t)) return false;
  if (/\b10\.\d{4,}\//.test(t)) return false;
  if (/^(http|www\.)/i.test(t)) return false;
  if (/^(research|home|profile|publications?)$/i.test(t)) return false;
  // Must look like a real title: letters + spaces, not an id slug
  if (!/[a-zA-Z]{4,}/.test(t) || !/\s/.test(t)) return false;
  // Reject mostly-numeric ids like "s42256-024-00976-7"
  const letters = (t.match(/[a-zA-Z]/g) || []).length;
  const digits = (t.match(/\d/g) || []).length;
  if (digits >= 6 && digits >= letters) return false;
  return true;
}

/** Empty familiarity claims that prove nothing. */
export function bodyHasGenericFamiliarity(body: string): boolean {
  return (
    /\bI spent time with that work\b/i.test(body) ||
    /\bnot just the lab homepage\b/i.test(body) ||
    /\bhow it (connects|relates) to your research area\b/i.test(body) ||
    /\bI am interested in how it connects\b/i.test(body) ||
    /\bA concrete takeaway for me was this:\b/i.test(body) ||
    /\bThat is where I think I can help: not only by asking for advice\b/i.test(
      body
    ) ||
    /\byour research is fascinating\b/i.test(body) ||
    /\bdeeply interested in your research\b/i.test(body) ||
    /\bI am passionate about\b/i.test(body) ||
    /\baligns perfectly with my interests\b/i.test(body) ||
    /\bI would love to learn from you\b/i.test(body) ||
    /\bhighly motivated student\b/i.test(body)
  );
}

export function bodyWordCount(body: string): number {
  return body.split(/\s+/).filter(Boolean).length;
}

/** True if a quoted "paper" in the body is actually a DOI/id slug. */
export function bodyCitesJunkPaperId(body: string): boolean {
  const quotes = [...body.matchAll(/"([^"]{6,120})"/g)].map((m) => m[1]);
  return quotes.some((q) => !isUsablePaperTitle(q) && /[\d-]{8,}/.test(q));
}

/** True if offer section is school/GPA fluff instead of skills/projects. */
export function bodyHasWeakOfferBullets(body: string): boolean {
  // Resume-speak without pronouns in experience blocks
  if (
    /\b(Architected and launched|Crowned Regional|Programmed cross-functional|Engineered autonomous)\b/.test(
      body
    ) &&
    !/\bI (architected|engineered|programmed|built|wrote)\b/i.test(body)
  ) {
    return true;
  }
  // Leading with TechSteps on a robotics/cable/vision email
  if (
    /\b(cable|robot|visual feedback|manipulat|carla|opencv)\b/i.test(body) &&
    /TechSteps[\s\S]{0,200}(AIEA|Cal Poly|VEX)/i.test(body)
  ) {
    return true;
  }
  // Offering robotics/CV theater on social-science migrant/climate papers
  if (
    /\b(undocumented|migrant|climate-induced|migrant-serving)\b/i.test(body) &&
    /\b(CARLA|hyperspectral|computer vision pipelines|Simulation and edge cases)\b/i.test(
      body
    )
  ) {
    return true;
  }
  // Copy-paste label reuse: LvlUp under hardware/pipelines heading
  if (
    /Hardware\/software data pipelines:[\s\S]{0,80}LvlUp/i.test(body)
  ) {
    return true;
  }
  // AI-governance hook on a social/migrant paper
  if (
    /\b(undocumented|migrant|climate-induced)\b/i.test(body) &&
    /\bgovernance ideas into concrete checks\b/i.test(body)
  ) {
    return true;
  }
  // Kroemer leftover: "cable setups" on a non-cable paper
  if (
    /\bcable setups\b/i.test(body) &&
    !/\b(cable|unweav|tangle)\b/i.test(body.replace(/\bcable setups\b/gi, ""))
  ) {
    return true;
  }
  // Low-level sync hook on foundation-model / scene-graph paper
  if (
    /\b(scene graph|foundation.?model|FOUND-IT)\b/i.test(body) &&
    /\bsensing toolchain side\b/i.test(body)
  ) {
    return true;
  }

  const bullets = [...body.matchAll(/^\s*•\s+(.+)$/gm)].map((m) => m[1]);
  const offerBlock =
    body.match(
      /(?:What I can offer:|Here is how|Simulation and edge cases:|Hardware\/software)([\s\S]*?)(?:\n\n(?:I can commit|I have about|I am available|Would you|My goal)|$)/i
    )?.[1] || body;

  if (/\b(los rios|skillsusa|community college district)\b/i.test(offerBlock)) {
    return true;
  }

  const hasRichProject =
    /\b(lab|carla|vex|fastapi|python|c\+\+|robot|simulat|hardware|tech-?steps|april\s*tag|bioresource|aiea|opencv|vision)\b/i.test(
      offerBlock
    ) ||
    bullets.some((b) =>
      /\b(python|c\+\+|robot|vex|tech-?steps|project|built|developed|led|ml|vision|oop)\b/i.test(
        b
      )
    );

  if (bullets.length) {
    const weak = bullets.filter((b) =>
      /\b(los rios|folsom lake|dual enrollment|community college|skillsusa|4\.0|gpa)\b/i.test(
        b
      )
    );
    if (weak.length > 0) return true;
  }

  return !hasRichProject;
}

export function goalsLine(opts: {
  researchInterests?: string | null;
  brief?: string | null;
  professorFocus?: string | null;
}): string {
  const focus = (opts.professorFocus || "").trim();
  const interests = (opts.researchInterests || "").trim();
  if (focus.length > 12) {
    return `My goal is to learn how real research is done while contributing useful work related to ${focus.split(/[.;\n]/)[0]?.trim()}.`;
  }
  if (interests.length > 20) {
    return `My goal is to learn how real research is done while contributing useful work on ${interests.split(/[.;\n]/)[0]?.trim()}.`;
  }
  return "My goal is to learn how a research group works day to day and to contribute something concrete that helps your projects move forward.";
}

/** Score a draft body/subject against the acceptance tips. */
export function scoreAcceptanceFormat(opts: {
  subject: string;
  body: string;
  willAttach: boolean;
  requireDualEnrollment?: boolean;
}): AcceptanceChecklist {
  const { subject, body, willAttach } = opts;
  const missing: string[] = [];

  const clearSubject =
    /prospective\s+(summer\s+)?(research\s+)?student/i.test(subject) ||
    /summer student|research (inquiry|opportunity|volunteer)/i.test(subject) ||
    /high school researcher/i.test(subject) ||
    /interested in remote/i.test(subject) ||
    /volunteer research/i.test(subject);
  if (!clearSubject) {
    missing.push(
      "Subject should signal research ask (e.g. High school researcher… or Prospective Research Student)"
    );
  }

  const specificPaperOrWork =
    /"[^"]{10,}"/.test(body) ||
    /\b(your paper|your work on|your recent|in \".+\")\b/i.test(body);
  if (!specificPaperOrWork) missing.push("Cite a specific paper or concrete piece of their work");

  const whyThisPerson =
    specificPaperOrWork &&
    /\b(stood out|takeaway|drawn to|drew me|curious about|curious how|Although I have not|eager to learn|genuinely curious|occlusion|state[\s-]?estimation|visual[\s-]?feedback|pipeline|sensing|closed[\s-]?loop|adaptab|organiz|measured|methodology|foundation model|scene graph|granularity|because of your paper|specifically because|examines|frames|finding|method|technical approach)\b/i.test(
      body
    ) &&
    !bodyHasGenericFamiliarity(body);
  if (!whyThisPerson) {
    missing.push(
      "Show a technical hook from THEIR paper (method/sensing/CV — not abstract regurgitation)"
    );
  }

  const studentIdentityClear = opts.requireDualEnrollment
    ? /\bhigh\s*school\b/i.test(body) && /\bdual[\s-]?enroll/i.test(body)
    : body.length > 80;
  if (!studentIdentityClear) {
    missing.push("Clear high-school dual-enrollment identity");
  }

  const whatYouOffer =
    /here is how my background can support/i.test(body) ||
    /Here is the experience I would bring/i.test(body) ||
    /Simulation and edge cases:/i.test(body) ||
    /Hardware\/software data pipelines:/i.test(body) ||
    /Computer vision:/i.test(body) ||
    (body.match(/^\s*•\s+/gm) || []).length >= 1 ||
    /\b(i (can|have|built|developed|engineered|programmed|wrote|competed|led)|my (experience|background|skills))\b/i.test(
      body
    );
  if (!whatYouOffer) missing.push("Say what you offer / special skills");

  const specialSkillsOrFocus =
    /\b(python|c\+\+|ros|robot|vision|carla|opencv|ml|machine learning|cad|arduino|competition|olympiad|physics|project|simulation)\b/i.test(
      body
    );
  if (!specialSkillsOrFocus) missing.push("Name concrete skills or sustained activities");

  const timeIntensity =
    /\b(\d+\s*[-–]?\s*\d*\s*hours?\s*(per|\/)\s*week|hours?\s*per\s*week|summer|school year|full[\s-]?time|part[\s-]?time)\b/i.test(
      body
    );
  if (!timeIntensity) missing.push("State time commitment / intensity");

  // Goals can be implicit in a short ask ("apply…", "take on…", "contribute on the…")
  const goals =
    /\b(goal|hope to (learn|contribute|gain)|want to (learn|apply)|looking to|would love to apply|would be glad to (take|help)|contribute on the|take on (any |data|simulation|remote)|help your group with)\b/i.test(
      body
    );
  if (!goals) missing.push("State goals / what you want to contribute");

  const localOrWorkMode =
    /\b(remote|in[\s-]?person|hybrid|local|zoom|nearby|miles|sacramento|folsom|california|bay area|visit)\b/i.test(
      body
    );
  if (!localOrWorkMode) missing.push("Say remote/local/in-person preference");

  const softAsk =
    /\b(meet|meeting|call|chat|reply|would you (have|be open)|if you have)\b/i.test(
      body
    );
  if (!softAsk) missing.push("Soft ask for meeting or reply");

  const claimsAttach =
    /\b(attached (my )?(cv|resume)|i have attached)\b/i.test(body);
  const attachmentOk = willAttach ? claimsAttach || /\b(cv|resume)\b/i.test(body) : !claimsAttach;
  if (!attachmentOk) {
    missing.push(
      willAttach
        ? "Mention attached CV/resume"
        : "Do not claim an attachment that is not sending"
    );
  }

  const wordCount = body.trim().split(/\s+/).length;
  const junkPaper = bodyCitesJunkPaperId(body);
  const weakBullets = bodyHasWeakOfferBullets(body);
  const genericFamiliarity = bodyHasGenericFamiliarity(body);
  const leakedInstructions =
    /\blocation-based\s*:/i.test(body) ||
    /\bIf distance is unknown\b/i.test(body) ||
    /\bstudent school area\s*:/i.test(body) ||
    /\bJust let me know about your preferences\b/i.test(body);
  if (junkPaper) missing.push("Cited paper must be a real title, not a DOI/id");
  if (weakBullets) {
    missing.push("Offer must be skills/projects in letter voice, not school fluff or resume-speak");
  }
  if (genericFamiliarity) {
    missing.push("Replace empty familiarity claims with a real technical paper hook");
  }
  if (leakedInstructions) {
    missing.push("Remove internal drafting notes from the email body");
  }

  // Punchy mentor-style letters land ~120–320 words (research best practice)
  const simpleReadable =
    wordCount >= 100 &&
    wordCount <= 320 &&
    !/\*\*|__|`|# /.test(body) &&
    (body.match(/\n\n/g) || []).length >= 3 &&
    !junkPaper &&
    !weakBullets &&
    !genericFamiliarity &&
    !leakedInstructions;
  if (
    !simpleReadable &&
    !junkPaper &&
    !weakBullets &&
    !genericFamiliarity &&
    !leakedInstructions
  ) {
    missing.push("Keep ~100–320 words, plain text, short paragraphs");
  }

  const flags = {
    clearSubject,
    whyThisPerson,
    specificPaperOrWork,
    studentIdentityClear,
    whatYouOffer,
    specialSkillsOrFocus,
    timeIntensity,
    goals,
    localOrWorkMode,
    softAsk,
    attachmentOk,
    simpleReadable,
  };
  const passed = Object.values(flags).filter(Boolean).length;
  const score = Math.round((passed / Object.keys(flags).length) * 100);

  return { ...flags, score, missing };
}

export const ACCEPTANCE_STRUCTURE_PROMPT = `MANDATORY BODY STRUCTURE (plain text, short conversational letter — professors skim in ~45 seconds; target 120–220 words):
1) Greeting
2) WHO + ASK — one short identity sentence. Ask for a conversation / remote volunteer tasks, NOT undergrad admissions.
3) PAPER HOOK — cite ONE paper title ONCE in quotes, then ONE genuine technical observation or question about method/findings (homework, not abstract dump). Show you read the work.
4) HONEST BRIDGE — one sentence acknowledging what you have NOT done yet + eagerness to learn and contribute (Angel Toasakul style). Not resume flexing.
5) REMOTE HONESTY (when physical lab + remote student) — acknowledge on-site limits; pivot to software/simulation/data.
6) PROOF — 1–2 labeled first-person experience blocks matched to PAPER DOMAIN (letter voice, not resume bullets).
7) TIME + CONTRIBUTION — hours/week + concrete tasks you can take on.
8) CLOSE — low-commitment ask (brief call / conversation to discuss opportunities). Sign off.

Subject: specific to paper theme or research focus (e.g. "Research inquiry — [short paper theme]"). NOT generic "Prospective Research Student" or "Research Opportunity Inquiry".

FORBIDDEN: generic praise, proving how impressive you are, mass-email template feel, asking for a position directly in email #1, abstract regurgitation, resume-speak without "I/We".

Keep under ~220 words when possible. No fluff, no Markdown, no em dashes.`;
