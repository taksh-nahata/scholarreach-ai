/**
 * Professor-aware "what I can offer" section.
 * Picks the most relevant projects and writes short, specific paragraphs
 * (Zaharia-email quality) without abandoning the tip-based overall format.
 */

export type OfferProject = {
  name: string;
  role?: string;
  details?: string;
  tags?: string[];
};

function tokenize(text: string): Set<string> {
  const raw = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const out = new Set<string>();
  for (const w of raw) {
    out.add(w);
    // light stemming / aliases so paper titles match project tags
    if (w.endsWith("ously") && w.length > 7) out.add(w.slice(0, -5)); // autonomously → autonom
    if (w.endsWith("ing") && w.length > 5) out.add(w.slice(0, -3));
    if (w === "visual" || w === "vision") {
      out.add("vision");
      out.add("visual");
      out.add("cameras");
    }
    if (w.startsWith("autonom")) {
      out.add("autonomous");
      out.add("robotics");
    }
    if (w === "cable" || w === "cables" || w === "feedback") {
      out.add("robotics");
      out.add("sensors");
    }
    if (w === "governance" || w === "lifecycle" || w === "physical") {
      out.add("ai");
      out.add("systems");
    }
    if (w === "dark" || w === "matter" || w === "gauge" || w === "symmetry") {
      out.add("physics");
      out.add("theory");
    }
  }
  return out;
}

function inferTags(p: OfferProject): string[] {
  if (p.tags?.length) return p.tags.map((t) => t.toLowerCase());
  const blob = `${p.name} ${p.role || ""} ${p.details || ""}`.toLowerCase();
  const tags: string[] = [];
  const rules: Array<[RegExp, string[]]> = [
    [/python|fastapi|django|flask/, ["python", "backend", "pipeline", "data"]],
    [/c\+\+|firmware|microcontroller/, ["c++", "firmware", "systems", "hardware"]],
    [/javascript|html|css|web|platform/, ["web", "javascript", "product"]],
    [/carla|simulation|anomaly/, ["simulation", "autonomous", "ai", "testing"]],
    [/robot|vex|april\s*tag|localization|monte\s*carlo/, ["robotics", "sensors", "autonomous", "hardware"]],
    [/camera|vision|hyperspectral|pypylon|vmbpy/, ["vision", "cameras", "hardware", "sensors"]],
    [/hardware|motor|sdk|sensor/, ["hardware", "systems", "sensors"]],
    [/ml|machine learning|llm|ai|dspy/, ["ai", "ml", "llm"]],
    [/data|ingest|pipeline|analysis/, ["data", "pipeline", "systems"]],
  ];
  for (const [re, ts] of rules) {
    if (re.test(blob)) tags.push(...ts);
  }
  return Array.from(new Set(tags));
}

function scoreProject(p: OfferProject, professorBlob: string): number {
  const tags = inferTags(p);
  const prof = tokenize(professorBlob);
  let score = 0;
  for (const t of tags) {
    if (prof.has(t)) score += 4;
    for (const w of prof) {
      if (w === t) continue;
      if (w.includes(t) || t.includes(w)) score += 1;
    }
  }
  const detail = (p.details || "").length;
  score += Math.min(3, Math.floor(detail / 100));
  if (/\blab\b|\b(usc|cal poly|berkeley|stanford|mit)\b/i.test(p.name)) score += 2;
  // Hard-penalize TechSteps on robotics/CV/hardware papers (web UX ≠ cable unweaving)
  if (/tech-?steps/i.test(p.name)) {
    if (
      /\b(robot|manipulat|cable|unweav|gripper|vision|visual feedback|opencv|carla|simulat|hardware|sensor)\b/i.test(
        professorBlob
      )
    ) {
      score -= 20;
    } else if (
      !/\b(web|product|education|hci|interface)\b/i.test(professorBlob)
    ) {
      score -= 6;
    }
  }
  if (/data analysis system/i.test(p.name) && !/\b(data|pipeline|stat|ml|learning)\b/i.test(professorBlob)) {
    score -= 1;
  }
  return score;
}

function truncateDetail(raw: string, max = 280): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t.replace(/[.]+$/, "") + ".";
  // Prefer ending on a sentence boundary inside the window
  const window = t.slice(0, max);
  const sentenceEnd = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("; ")
  );
  if (sentenceEnd > 100) {
    return window.slice(0, sentenceEnd + 1).trim();
  }
  const at = window.lastIndexOf(" ");
  const cut = (at > 100 ? window.slice(0, at) : window).trim();
  return `${cut.replace(/[,:;\-–—]+$/, "")}.`;
}

function bridgeLine(p: OfferProject, professorBlob: string): string {
  const tags = inferTags(p);
  const lower = professorBlob.toLowerCase();
  const wantsSystems =
    /\b(system|infrastructure|pipeline|compil|llm|language model|dspy|scalab|backend|data|governance)\b/i.test(
      lower
    );
  const wantsSim =
    /\b(simulat|autonomous|robot|agent|anomaly|test|edge.?case|car|cable|unweav)\b/i.test(
      lower
    );
  const wantsHw =
    /\b(hardware|sensor|camera|vision|visual|robot|embed|firmware|apparatus|physical)\b/i.test(
      lower
    );
  const wantsMl = /\b(machine learning|ml|ai|neural|model|fair|surviv|physical ai)\b/i.test(
    lower
  );

  if (tags.includes("simulation") || /carla/i.test(p.name)) {
    return wantsSim || wantsMl
      ? "That kind of controlled test-environment work is useful when validating reliability and edge cases in AI or autonomous systems."
      : "Building reliable simulation and test setups is transferable to careful experimental validation in a research group.";
  }
  if (
    tags.includes("robotics") ||
    /vex/i.test(p.name) ||
    tags.includes("firmware")
  ) {
    return wantsHw || wantsSim || wantsMl
      ? "Low-level programming and state estimation give me a solid base for systems work, sensing, and algorithm implementation in the lab."
      : "Sustained robotics work shows I can follow through on technical projects and debug carefully under constraints.";
  }
  if (
    tags.includes("hardware") ||
    tags.includes("cameras") ||
    /bioresource|pypylon/i.test(p.name + (p.details || ""))
  ) {
    return wantsSystems || wantsHw
      ? "That hardware-software integration experience maps well to data ingestion, toolchains, and systems support around research infrastructure."
      : "Comfort with SDKs, sensors, and multi-threaded control is useful for applied research that crosses software and physical systems.";
  }
  if (tags.includes("web") || tags.includes("python") || tags.includes("data")) {
    return wantsSystems || wantsMl
      ? "I can help with scripting, data pipelines, and practical tooling that keeps experiments moving."
      : "I am comfortable turning ambiguous technical tasks into working code and clear documentation.";
  }
  return "I am ready to start with whatever technical contribution would help your group most.";
}

export function parseOfferProjects(opts: {
  projectsJson?: string | null;
  brief?: string | null;
}): OfferProject[] {
  const out: OfferProject[] = [];
  try {
    const projects = opts.projectsJson
      ? (JSON.parse(opts.projectsJson) as OfferProject[])
      : [];
    for (const p of projects || []) {
      if (p?.name) out.push(p);
    }
  } catch {
    /* ignore */
  }

  if (out.length >= 2) return out;

  // Fallback: parse brief "Projects / research:" lines
  const brief = opts.brief || "";
  const lines = brief.split("\n").map((l) => l.trim());
  for (const line of lines) {
    const m = line.match(/^[-•*]\s*(.+?)(?:\s*\(([^)]+)\))?:\s*(.+)$/);
    if (!m) continue;
    if (/\b(los rios|skillsusa|4\.0|dual enrollment)\b/i.test(m[0])) continue;
    out.push({ name: m[1].trim(), role: m[2]?.trim(), details: m[3].trim() });
  }
  return out;
}

/**
 * Build a skim-friendly but thorough offer section tailored to this faculty member.
 */
export function buildOfferSection(opts: {
  professor: {
    researchFocus?: string | null;
    recentPaper?: string | null;
    labName?: string | null;
    university?: string | null;
    department?: string | null;
    name?: string | null;
  };
  projectsJson?: string | null;
  skillsJson?: string | null;
  brief?: string | null;
  maxProjects?: number;
}): string {
  const professorBlob = [
    opts.professor.researchFocus,
    opts.professor.recentPaper,
    opts.professor.labName,
    opts.professor.department,
    opts.professor.university,
    opts.professor.name,
  ]
    .filter(Boolean)
    .join(" ");

  const projects = parseOfferProjects({
    projectsJson: opts.projectsJson,
    brief: opts.brief,
  });

  const ranked = projects
    .map((p) => ({ p, score: scoreProject(p, professorBlob) }))
    .sort((a, b) => b.score - a.score);

  const max = opts.maxProjects ?? 3;
  const chosen = ranked.slice(0, max).map((r) => r.p);
  // If scores are all tiny, still use top projects but prefer lab-named ones
  const picks =
    chosen.length >= 2
      ? chosen
      : projects.slice(0, max);

  let skillsLine = "";
  try {
    const skills = opts.skillsJson
      ? (JSON.parse(opts.skillsJson) as {
          languages?: string[];
          frameworks?: string[];
          expertise?: string[];
        })
      : null;
    const tech = [
      ...(skills?.languages || []),
      ...(skills?.frameworks || []),
      ...(skills?.expertise || []),
    ].filter(Boolean);
    if (tech.length) {
      skillsLine = `Core tools I use regularly: ${tech.slice(0, 8).join(", ")}.`;
    }
  } catch {
    /* ignore */
  }

  const paragraphs = picks.map((p) => {
    const title = p.name;
    const roleBit = p.role ? ` - ${p.role}` : "";
    const detail = truncateDetail(p.details || "Hands-on technical project work.");
    const bridge = bridgeLine(p, professorBlob);
    return `${title}${roleBit}: ${detail} ${bridge}`;
  });

  if (!paragraphs.length) {
    return `What I can offer:
• Hands-on project experience in software, robotics, and careful debugging, with a willingness to start on whatever technical task helps most.`;
  }

  return `Here is how my background can support work like yours:

${paragraphs.join("\n\n")}${skillsLine ? `\n\n${skillsLine}` : ""}`;
}
