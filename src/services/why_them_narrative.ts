/**
 * Personal outreach narrative: acknowledge paper → what you learned → how you help → skills proof.
 */
import type { PaperContext } from "@/services/paper_context";
import {
  mentorshipEmailLine,
  type MentorshipEvidence,
} from "@/services/mentorship_evidence";
import {
  buildOfferSection,
  parseOfferProjects,
  type OfferProject,
} from "@/services/offer_section";

function tokenize(text: string): Set<string> {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9+\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

function projectFitScore(p: OfferProject, paperBlob: string): number {
  const tags = (p.tags || []).map((t) => t.toLowerCase());
  const blob = `${p.name} ${p.role || ""} ${p.details || ""} ${tags.join(" ")}`;
  const a = tokenize(blob);
  const b = tokenize(paperBlob);
  let score = 0;
  for (const w of a) if (b.has(w)) score += 2;

  const lower = paperBlob.toLowerCase();
  // Soft transferable bridges when topical overlap is weak (common for HS STEM → social-science labs)
  if (/\b(data|dataset|survey|analytic|visual|map|tool|platform|system|simulat|model)\b/i.test(lower)) {
    if (/python|data|pipeline|fastapi|web|tech-?steps|visual/i.test(blob)) score += 3;
  }
  if (/\b(disaster|climate|community|migrant|adapt|organiz|policy|social|undocumented)\b/i.test(lower)) {
    if (/tech-?steps|squeegee|outreach|client|platform|document|visual|gemini/i.test(blob))
      score += 6;
    if (/simulat|carla|test|edge.?case/i.test(blob)) score += 2;
    // Penalize pure robotics when the paper is clearly social/policy
    if (/vex|firmware|microcontroller/i.test(blob) && !/\b(robot|sensor|autonomous)\b/i.test(lower)) {
      score -= 2;
    }
  }
  if (/\b(robot|vision|autonomous|hardware|sensor|ai|ml|computer)\b/i.test(lower)) {
    if (/carla|vex|opencv|camera|hardware|robot|python|c\+\+/i.test(blob)) score += 5;
  }
  if (/\blab\b/i.test(p.name)) score += 1;
  return score;
}

function helpAngle(
  paper: PaperContext | null,
  focus: string,
  top: OfferProject | null
): string {
  const topicPhrase =
    (paper?.themes?.[0] && paper.themes[0].length > 12
      ? paper.themes[0]
      : null) ||
    focus.split(/[.;\n]/)[0]?.trim() ||
    "this line of work";

  if (top) {
    const detail = (top.details || "").replace(/\s+/g, " ").trim();
    let snippet = detail;
    if (snippet.length > 170) {
      const cut = snippet.slice(0, 170);
      const at = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
      snippet =
        at > 60
          ? cut.slice(0, at + 1).trim()
          : `${cut.replace(/\s+\S*$/, "").replace(/[,:;]+$/, "")}.`;
    } else if (snippet && !/[.!?]$/.test(snippet)) {
      snippet = `${snippet}.`;
    }
    return (
      `That is where I think I can help: not only by asking for advice, but by taking on concrete tasks connected to ${topicPhrase}. ` +
      `For example, in ${top.name}${top.role ? ` (${top.role})` : ""}, ` +
      `${snippet || "I built and shipped technical work under constraints. "} ` +
      `I want to apply that same execution style to support your group's current needs.`
    );
  }

  return (
    `I am writing because I want to contribute useful work on problems like ${topicPhrase}, ` +
    `starting with whatever concrete task would help your group most (analysis, tooling, documentation, or implementation).`
  );
}

/**
 * Opening story block after the identity line.
 * Flow: ask + paper cite → learned/insight → how I help (linked to a real project).
 */
export function buildWhyThemStory(opts: {
  university: string;
  labName?: string | null;
  paperTitle?: string | null;
  researchFocus?: string | null;
  paper: PaperContext | null;
  projectsJson?: string | null;
  brief?: string | null;
  mentorshipEvidence?: MentorshipEvidence[] | null;
}): string {
  const labBit = opts.labName ? ` (${opts.labName})` : "";
  const focus =
    (opts.researchFocus || "").split(/[.;\n]/)[0]?.trim() ||
    "your research agenda";
  const paperTitle = opts.paper?.title || opts.paperTitle || null;

  const projects = parseOfferProjects({
    projectsJson: opts.projectsJson,
    brief: opts.brief,
  });
  const paperBlob = [
    paperTitle,
    opts.paper?.abstract,
    ...(opts.paper?.themes || []),
    opts.researchFocus,
  ]
    .filter(Boolean)
    .join(" ");
  const ranked = projects
    .map((p) => ({ p, score: projectFitScore(p, paperBlob) }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0]?.p || null;

  const ask = `I am writing to ask about contributing as a research student / volunteer with your group at ${opts.university}${labBit}.`;

  const mentorshipLine = mentorshipEmailLine({
    evidence: opts.mentorshipEvidence || [],
    researchFocus: opts.researchFocus,
    paperTitle,
    labName: opts.labName,
  });

  if (paperTitle && opts.paper) {
    return [
      ask,
      mentorshipLine,
      `I reached out specifically because of your paper "${paperTitle}".`,
      opts.paper.insight,
      helpAngle(opts.paper, focus, top),
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (paperTitle) {
    return [
      ask,
      mentorshipLine,
      `I reached out specifically because of your paper "${paperTitle}".`,
      `The problem it names - and how it frames ${focus} - is what made me want to contribute, not a quick skim of the lab homepage.`,
      helpAngle(null, focus, top),
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    ask,
    mentorshipLine,
    `I am reaching out because of your work on ${focus}.`,
    helpAngle(null, focus, top),
  ]
    .filter(Boolean)
    .join(" ");
}

/** Offer section that ranks projects against the paper, not only the lab blurbs. */
export function buildPersonalizedOffer(opts: {
  professor: {
    researchFocus?: string | null;
    recentPaper?: string | null;
    labName?: string | null;
    university?: string | null;
    department?: string | null;
    name?: string | null;
  };
  paper: PaperContext | null;
  projectsJson?: string | null;
  skillsJson?: string | null;
  brief?: string | null;
  maxProjects?: number;
}): string {
  const professorWithPaper = {
    ...opts.professor,
    recentPaper: opts.paper?.title || opts.professor.recentPaper,
    researchFocus: [
      opts.professor.researchFocus,
      opts.paper?.abstract?.slice(0, 400),
      ...(opts.paper?.themes || []),
    ]
      .filter(Boolean)
      .join(". "),
  };

  return buildOfferSection({
    professor: professorWithPaper,
    projectsJson: opts.projectsJson,
    skillsJson: opts.skillsJson,
    brief: opts.brief,
    maxProjects: opts.maxProjects,
  }).replace(
    "Here is how my background can support work like yours:",
    opts.paper
      ? "Here is how specific parts of my background map onto the kind of work in that paper and your broader agenda:"
      : "Here is how specific parts of my background can support work like yours:"
  );
}
