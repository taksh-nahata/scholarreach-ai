/**
 * Short, conversational research outreach letter.
 * Domain-aware: social science ≠ robotics ≠ AI systems.
 * Mentor rules: technical/method hook, relevant projects first,
 * letter voice, honest remote pivot for physical labs.
 */
import type { PaperContext } from "@/services/paper_context";
import {
  parseOfferProjects,
  type OfferProject,
} from "@/services/offer_section";
import { formalizeAvailabilityHours } from "@/services/email_acceptance_format";
import { credentialPhrase } from "@/services/doc_type";
import {
  mentorshipEmailLine,
  type MentorshipEvidence,
} from "@/services/mentorship_evidence";

export type PaperDomain =
  | "social_science"
  | "robotics_cv"
  | "ai_systems"
  | "physics"
  | "general";

function paperBlob(
  paper: PaperContext | null,
  focus?: string | null,
  title?: string | null
) {
  return [title, paper?.title, paper?.abstract, ...(paper?.themes || []), focus]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Title+abstract only — avoid polluting domain with unrelated researchFocus. */
function paperCoreBlob(paper: PaperContext | null, title?: string | null) {
  return [title, paper?.title, paper?.abstract, ...(paper?.themes || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function classifyPaperDomain(blob: string): PaperDomain {
  const b = blob.toLowerCase();

  // Social / policy / qualitative — check FIRST (wins over stray tech words)
  if (
    /\b(undocumented|migrant|migrant-serving|climate-induced|ethnograph|qualitative interview|community organiz)\b/.test(
      b
    ) ||
    (/\b(climate|disaster)\b/.test(b) &&
      /\b(community|organiz|migrant|adaptability|undocumented)\b/.test(b)) ||
    (/\b(policy|social science|nonprofit|ngo)\b/.test(b) &&
      /\b(community|disaster|migrant|climate|organiz)\b/.test(b))
  ) {
    return "social_science";
  }

  if (
    /\bphysical ai\b/.test(b) ||
    (/\bgovernance\b/.test(b) && /\b(lifecycle|ai system|physical ai)\b/.test(b))
  ) {
    return "ai_systems";
  }

  if (/\b(dark matter|gauge|symmetry|majoron|neutrino|particle physic)\b/.test(b)) {
    return "physics";
  }

  if (
    /\b(robot|manipulat|cable|unweav|gripper|actuator|visual feedback|opencv|carla|localization|state estimation|scene graph|foundation.?model|3d scene|spatial mapping)\b/.test(
      b
    ) ||
    (/\b(vision|sensor|camera|autonomous)\b/.test(b) &&
      /\b(manipulat|robot|feedback|pipeline|control|perception|mapping)\b/.test(b))
  ) {
    return "robotics_cv";
  }

  return "general";
}

/** Sub-theme inside robotics/CV — drives hooks, ranking, and remote-pivot wording. */
export function roboticsSubtheme(blob: string):
  | "cable_unweaving"
  | "scene_graphs_foundation"
  | "manipulation"
  | "simulation_safety"
  | "sensing_sync"
  | "vision_general"
  | "localization"
  | "generic" {
  const b = blob.toLowerCase();
  if (/\b(cable|unweav|tangle)\b/.test(b) && /\b(visual|vision|feedback)\b/.test(b)) {
    return "cable_unweaving";
  }
  if (
    /\b(scene graph|foundation.?model|found-?it|3d scene|granularity on demand|spatial mapping|task-driven 3d)\b/.test(
      b
    )
  ) {
    return "scene_graphs_foundation";
  }
  if (/\b(manipulat|gripper|arm)\b/.test(b) && /\b(vision|visual|sensor)\b/.test(b)) {
    return "manipulation";
  }
  if (/\b(carla|simulat)\b/.test(b) && /\b(fault|anomaly|edge|safety)\b/.test(b)) {
    return "simulation_safety";
  }
  // Require real sensing/sync language — do NOT fire on lone "camera" in perception papers
  if (
    /\bhyperspectral\b/.test(b) ||
    (/\b(sensor fusion|synchron|data capture)\b/.test(b) &&
      /\b(camera|motor|instrument|slider)\b/.test(b))
  ) {
    return "sensing_sync";
  }
  if (/\b(localization|state estimation|slam|april\s*tag)\b/.test(b)) {
    return "localization";
  }
  if (/\b(vision|opencv|detection|segmentation|tracking|perception)\b/.test(b)) {
    return "vision_general";
  }
  return "generic";
}

function isPhysicalLabDomain(domain: PaperDomain, blob: string) {
  if (
    domain === "social_science" ||
    domain === "physics" ||
    domain === "ai_systems"
  ) {
    return false;
  }
  if (domain === "robotics_cv") {
    const sub = roboticsSubtheme(blob);
    // Perception / scene-graph labs still have physical robots & sensors on site
    if (
      sub === "scene_graphs_foundation" ||
      sub === "cable_unweaving" ||
      sub === "manipulation" ||
      sub === "sensing_sync"
    ) {
      return true;
    }
    return /\b(robot|manipulat|cable|unweav|gripper|actuator|hardware|apparatus|lab bench|camera calibration|arm)\b/i.test(
      blob
    );
  }
  return false;
}

/** Score how well a project fits THIS paper domain. */
export function rankProjectForPaper(p: OfferProject, blob: string): number {
  const domain = classifyPaperDomain(blob);
  const text = `${p.name} ${p.role || ""} ${p.details || ""} ${(p.tags || []).join(" ")}`.toLowerCase();
  let score = 0;

  if (domain === "social_science") {
    // Lead with non-technical tooling (maps to org / community work), then Python data
    if (/tech-?steps|squeegee|document|visual guide|non-technical|outreach|platform/i.test(text))
      score += 24;
    if (/cal poly|data collection|synchron/i.test(text) && /python/i.test(text))
      score += 16;
    else if (/python|pipeline|data|ingest|cleaning|analysis|script|automat/i.test(text))
      score += 12;
    if (/lvlup|pitch|entrepreneur|startup/i.test(text)) score += 3;
    if (/carla|simulat|fault condition|autonomous vehicle/i.test(text)) score -= 25;
    if (/vex|opencv|computer vision|c\+\+|sensor feedback|april\s*tag/i.test(text))
      score -= 22;
    if (/\baiea\b/i.test(text) && /carla|simulat/i.test(text)) score -= 15;
    return score;
  }

  if (domain === "robotics_cv") {
    const sub = roboticsSubtheme(blob);
    if (/carla|simulat|edge.?case|fault|anomaly/i.test(text)) score += 20;
    if (/hyperspectral|camera|motor|hardware|synchron|cal poly|bioresource/i.test(text))
      score += 18;
    if (/vex|c\+\+|computer vision|opencv|sensor feedback|april\s*tag|localization/i.test(text))
      score += 16;
    if (/python|pipeline|data ingest|toolchain/i.test(text)) score += 4;
    if (/aiea|gilpin/i.test(text)) score += 3;
    if (/tech-?steps|squeegee|lvlup|pitch|entrepreneur/i.test(text)) score -= 20;
    if (/\blab\b|\bcal poly\b|\baiea\b/i.test(p.name)) score += 2;
    // 3D scene graphs / foundation models → CARLA & perception first
    if (sub === "scene_graphs_foundation") {
      if (/carla|simulat|aiea|3d|spatial|perception/i.test(text)) score += 14;
      if (/vex|opencv|vision|sensor feedback/i.test(text)) score += 6;
      if (/hyperspectral|slider motor/i.test(text)) score -= 4; // secondary, not the hook
    }
    return score;
  }

  if (domain === "ai_systems") {
    if (/carla|simulat|fault|edge.?case|anomaly|aiea/i.test(text)) score += 16;
    if (/python|pipeline|toolchain|systems/i.test(text)) score += 8;
    if (/tech-?steps|document|platform/i.test(text)) score += 4;
    if (/vex|firmware/i.test(text)) score -= 6;
    return score;
  }

  if (/python|pipeline|data|lab/i.test(text)) score += 6;
  if (/tech-?steps|platform/i.test(text)) score += 3;
  if (/carla|vex|vision/i.test(text)) score += 2;
  if (/\blab\b/i.test(p.name)) score += 2;
  return score;
}

/** Turn resume fragments into first-person letter prose. */
export function toLetterVoice(detail: string): string {
  let d = detail.replace(/\s+/g, " ").trim();
  d = d.replace(/^[•\-*]\s*/, "");
  if (/^I\s+/i.test(d)) return d.replace(/[.]+$/, "") + ".";

  const starters: Array<[RegExp, string]> = [
    [/^Engineered\b/i, "I engineered"],
    [/^Developed\b/i, "I developed"],
    [/^Programmed\b/i, "I programmed"],
    [/^Built\b/i, "I built"],
    [/^Architected\b/i, "I architected"],
    [/^Managed\b/i, "I managed"],
    [/^Wrote\b/i, "I wrote"],
    [/^Created\b/i, "I created"],
    [/^Implemented\b/i, "I implemented"],
    [/^Designed\b/i, "I designed"],
    [/^Led\b/i, "I led"],
    [/^Selected\b/i, "I was selected"],
    [/^Crowned\b/i, "We were crowned"],
    [/^Co-founded\b/i, "I co-founded"],
    [/^Formally\b/i, "I formally"],
  ];
  for (const [re, rep] of starters) {
    if (re.test(d)) {
      d = d.replace(re, rep);
      break;
    }
  }
  if (!/^I\b|^We\b/i.test(d)) {
    d = `I ${d.charAt(0).toLowerCase()}${d.slice(1)}`;
  }
  return d.replace(/[.]+$/, "") + ".";
}

function shortDetail(detail: string, max = 180): string {
  const letter = toLetterVoice(detail);
  if (letter.length <= max) return letter;
  const cut = letter.slice(0, max);
  const at = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  if (at > 80) return cut.slice(0, at + 1).trim();
  return `${cut.replace(/\s+\S*$/, "").replace(/[,:;]+$/, "")}.`;
}

function detailForDomain(
  p: OfferProject,
  domain: PaperDomain,
  blob: string
): string {
  const raw = (p.details || "").replace(/\s+/g, " ").trim();
  const name = p.name.toLowerCase();

  if (domain === "social_science") {
    if (/tech-?steps/i.test(name)) {
      return (
        raw ||
        "I built an interactive platform that helps non-technical users complete complex tasks through clear step-by-step guides."
      );
    }
    if (/cal poly|bioresource|bo liu/i.test(name)) {
      return "I wrote Python routines to automate structured data collection (synchronizing instruments and exporting clean datasets for analysis).";
    }
    if (/aiea|carla/i.test(name) || /carla|simulat/i.test(raw)) {
      return "I wrote Python scripts to run structured evaluations and log results for later analysis.";
    }
    if (/lvlup/i.test(name)) {
      return "I was selected as 1 of 15 global finalists (from 1,500+ applicants) and pitched a venture under tight deadlines - useful practice for clear communication and shipping under constraints.";
    }
    if (/vex/i.test(name)) {
      return "I write Python and C++ under competition deadlines - mainly useful here as disciplined scripting and debugging habits.";
    }
    if (/python|data|pipeline/i.test(raw)) {
      return shortDetail(raw, 200);
    }
    return raw || "I write Python scripts and ship careful technical work under constraints.";
  }

  if (domain === "robotics_cv") {
    return pickTechnicalDetail(raw, blob);
  }

  return raw || "I shipped technical work under real constraints.";
}

function pickTechnicalDetail(detail: string, blob: string): string {
  const raw = (detail || "").replace(/\s+/g, " ").trim();
  if (!raw) return "I shipped technical work under real constraints.";
  if (classifyPaperDomain(blob) !== "robotics_cv") return raw;

  const sentences = raw.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [raw];
  const scored = sentences.map((s) => {
    let score = 0;
    const t = s.toLowerCase();
    if (
      /\b(python|c\+\+|opencv|vision|sensor|pipeline|simulat|carla|camera|hardware|synchron|autonomous routine|localization|april)\b/.test(
        t
      )
    )
      score += 10;
    if (/\b(engineered|programmed|wrote|built|developed|implemented)\b/.test(t))
      score += 4;
    if (/\b(champion|award|ranked|crowned|tournament)\b/.test(t)) score -= 6;
    return { s: s.trim(), score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best && best.score > 0) {
    return best.s.endsWith(".") ? best.s : `${best.s}.`;
  }
  return raw;
}

function projectLabel(p: OfferProject, domain: PaperDomain): string {
  const t = `${p.name} ${p.details || ""}`.toLowerCase();

  if (domain === "social_science") {
    if (/tech-?steps|visual guide|non-technical|platform|document/i.test(t)) {
      return "Tooling for non-technical users";
    }
    if (/cal poly|data collection|python|pipeline|synchron|ingest/i.test(t)) {
      return "Python data automation";
    }
    if (/lvlup|pitch|startup|entrepreneur/i.test(t)) {
      return "Execution under deadlines";
    }
    if (/aiea|carla|simulat/i.test(t)) return "Python scripting for evaluations";
    if (/vex/i.test(t)) return "Disciplined coding practice";
    return "Technical support skills";
  }

  if (/lvlup|pitch|startup|entrepreneur/i.test(t)) return "Execution under deadlines";
  if (/carla|simulat|fault|anomaly|aiea/i.test(t)) return "Simulation and edge cases";
  if (/hyperspectral|camera|motor|hardware|synchron|cal poly/i.test(t)) {
    return "Hardware/software data pipelines";
  }
  if (/vex|opencv|vision|sensor feedback|c\+\+/i.test(t)) return "Computer vision";
  if (/tech-?steps|web|platform|gemini/i.test(t)) return "Tooling for non-technical users";
  if (domain === "robotics_cv" && /python|pipeline/i.test(t)) return "Software tooling";
  return p.role || "Technical project work";
}

function wherePhrase(p: OfferProject): string {
  const name = p.name.replace(/\s+/g, " ").trim();
  if (/aiea/i.test(name)) return "at Prof. Leilani Gilpin's AIEA Lab";
  if (/cal poly|bo liu|bioresource/i.test(name)) return "at Dr. Bo Liu's lab (Cal Poly)";
  if (/vex/i.test(name)) return "as lead programmer for my VEX robotics team (Team 20000Z)";
  if (/tech-?steps/i.test(name)) return "on TechSteps";
  if (/lvlup/i.test(name)) return "through the LvlUp Labs accelerator";
  return `in ${name}`;
}

/**
 * Method/findings hook — NEVER abstract regurgitation, NEVER wrong-domain hooks.
 */
export function technicalPaperHook(
  title: string,
  abstract: string | null
): string {
  const blob = `${title} ${abstract || ""}`.toLowerCase();
  const domain = classifyPaperDomain(blob);

  if (domain === "social_science") {
    if (/\b(undocumented|migrant)\b/.test(blob) && /\b(disaster|climate)\b/.test(blob)) {
      return "I was curious how you measured adaptability in practice - what data or organizational signals you used to see how migrant-serving groups actually responded during climate-induced disasters, not just how the problem is framed.";
    }
    if (/\b(survey|interview|qualitative|ethnograph|case study)\b/.test(blob)) {
      return "I kept coming back to the methods side: how you gathered and coded evidence from communities / organizations, and what made those measures of response or adaptability trustworthy.";
    }
    if (/\b(organiz|nonprofit|ngo|community)\b/.test(blob)) {
      return "I was especially interested in how you analyzed organizational roles and capacity - what indicators or sources let you distinguish symbolic support from concrete adaptability on the ground.";
    }
    if (abstract && abstract.length > 80) {
      const sentences = abstract.match(/[^.!?]+[.!?]+/g) || [];
      const methodish = sentences.find((s) =>
        /\b(we (analyzed|examined|surveyed|interviewed|measured|coded|used)|method|data|finding|result|adaptab)\b/i.test(
          s
        )
      );
      if (
        methodish &&
        methodish.trim().length > 40 &&
        methodish.trim().length < 220
      ) {
        const clean = methodish.replace(/\s+/g, " ").trim();
        return `One part I kept thinking about was your approach: ${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
      }
    }
    return "I am especially interested in your methods and findings - how you turn community / organizational evidence into concrete claims - and I want to help with careful data and research-support tasks rather than only ask for advice.";
  }

  if (/\bcable|unweav|tangle\b/.test(blob) && /\bvisual|vision|feedback\b/.test(blob)) {
    return "I was especially curious about the visual-feedback / state-estimation side of contact-rich cable work - how you deal with occlusion, deformation, and uncertain cable state rather than treating the task as open-loop motion.";
  }
  // FOUND-IT / 3D scene graphs / foundation models — BEFORE generic camera hooks
  if (
    /\b(scene graph|foundation.?model|found-?it|3d scene|granularity on demand|spatial mapping|task-driven 3d)\b/.test(
      blob
    )
  ) {
    return "I was interested in how you use foundation models to build task-driven 3D scene graphs with controllable granularity. Having worked with 3D spatial environments and perception sensors in simulation (CARLA), I am curious how your lab handles scale and on-demand detail in those graphs.";
  }
  if (/\bmanipulat|gripper|arm\b/.test(blob) && /\bvision|visual|sensor\b/.test(blob)) {
    return "I was drawn to the sensing and closed-loop control angle - how perception stays reliable enough to drive contact-rich manipulation under real visual clutter.";
  }
  if (/\bcarla|simulat\b/.test(blob) && /\bfault|anomaly|edge|safety\b/.test(blob)) {
    return "I cared most about the evaluation setup: how you stress the system under fault / edge-case conditions instead of only reporting best-case demos.";
  }
  // Tight: only true sensing/sync papers (not every paper that mentions a camera)
  if (
    /\bhyperspectral\b/.test(blob) ||
    (/\b(sensor fusion|synchron)\b/.test(blob) &&
      /\b(camera|motor|instrument|slider)\b/.test(blob) &&
      !/\b(scene graph|foundation.?model|3d scene)\b/.test(blob))
  ) {
    return "I was interested in the sensing toolchain side - keeping cameras, motion, and data capture tightly synchronized so experiments stay reproducible.";
  }
  if (/\bvision|opencv|detection|segmentation|tracking\b/.test(blob)) {
    return "I focused on the computer-vision pipeline choices - what has to stay robust when lighting, occlusion, or sensor noise get messy.";
  }
  if (/\blocalization|state estimation|slam|april\s*tag\b/.test(blob)) {
    return "I was drawn to the state-estimation / feedback-loop side of the work, and how perception errors propagate into control.";
  }

  if (domain === "ai_systems") {
    return "I was interested in how you turn high-level governance ideas into concrete checks across a system lifecycle, not just policy language.";
  }

  if (domain === "physics") {
    return "I cannot claim physics research depth yet, but I am interested in careful modeling / computational support work around theory-driven projects if that is useful to your group.";
  }

  if (abstract && abstract.length > 80) {
    const sentences = abstract.match(/[^.!?]+[.!?]+/g) || [];
    const methodish = sentences.find((s) =>
      /\b(method|approach|using|pipeline|model|estimat|detect|algorithm|feedback|sensor|we (propose|present|develop|introduce|analyze|examine))\b/i.test(
        s
      )
    );
    if (
      methodish &&
      methodish.trim().length > 40 &&
      methodish.trim().length < 220
    ) {
      const clean = methodish.replace(/\s+/g, " ").trim();
      return `One part I kept thinking about was the technical approach: ${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
    }
  }

  return "I am especially interested in the methods behind the work, and I want to help with concrete research-support tasks rather than only ask for advice.";
}

function askLine(opts: {
  university: string;
  labName?: string | null;
  remote: boolean;
  skillFocus: string;
  variant: number;
}): string {
  const labBit = opts.labName ? ` (${opts.labName})` : "";
  if (opts.remote) {
    const variants = [
      `I am writing to ask whether you have any remote volunteer research tasks this fall for someone with experience in ${opts.skillFocus}.`,
      `I wanted to ask if your group has any remote volunteer tasks this fall for someone with experience in ${opts.skillFocus}.`,
      `I am reaching out to see whether there are remote volunteer tasks I could help with this fall, especially around ${opts.skillFocus}.`,
    ];
    return variants[opts.variant % variants.length];
  }
  return `I am writing to ask about contributing as a research student / volunteer with your group at ${opts.university}${labBit}, with a focus on ${opts.skillFocus}.`;
}

/** Honest enthusiasm bridge (Angel Toasakul / mentor guidance): gap + willingness to learn. */
function curiosityBridge(domain: PaperDomain, blob: string, variant: number): string {
  if (domain === "social_science") {
    const variants = [
      "Although I have not worked in this exact research setting before, I am genuinely curious about the methods you use and would be glad to support your team on data and analysis tasks while I learn.",
      "I have not done fieldwork in this area yet, but the questions you are asking match what I want to explore, and I would welcome the chance to contribute on concrete remote tasks.",
    ];
    return variants[variant % variants.length];
  }
  if (domain === "robotics_cv") {
    const sub = roboticsSubtheme(blob);
    if (sub === "scene_graphs_foundation") {
      return "Although I have not worked with foundation-model scene graphs in a lab setting yet, I am excited by that direction and would love the chance to learn and contribute on simulation and perception tooling.";
    }
    const variants = [
      "Although I have not worked hands-on in your exact experimental setup yet, I am eager to learn and contribute on the software, simulation, and analysis side wherever that would help your students.",
      "I have not been in a robotics lab full-time yet, but I am genuinely interested in the methods behind this work and would be glad to take on remote tasks that move a project forward.",
    ];
    return variants[variant % variants.length];
  }
  if (domain === "ai_systems") {
    return "Although I am still building depth in AI governance work, I am interested in careful, practical support tasks (evaluation tooling, documentation, analysis) while I learn your group's approach.";
  }
  if (domain === "physics") {
    return "Although I cannot claim physics research depth yet, I am interested in careful computational support around theory-driven projects if that would be useful.";
  }
  const variants = [
    "Although I am still early in research, I am genuinely interested in your group's direction and would be glad to contribute on concrete tasks while I learn.",
    "I have not worked in this exact area yet, but I am curious about the methods you use and would welcome the chance to help on practical research tasks.",
  ];
  return variants[variant % variants.length];
}

function subjectForLetter(opts: {
  domain: PaperDomain;
  paperTitle?: string | null;
  researchFocus?: string | null;
  remote: boolean;
}): string {
  const paper = opts.paperTitle?.trim();
  if (paper && paper.length > 12) {
    const theme = paper.split(/[:—–]/)[0]?.trim() || paper;
    const short = theme.length > 58 ? `${theme.slice(0, 55)}…` : theme;
    return `Research inquiry — ${short}`;
  }
  const focus = (opts.researchFocus || "your research").split(/[.;\n]/)[0]?.trim();
  const focusShort =
    focus.length > 50 ? `${focus.slice(0, 47)}…` : focus || "your research";
  if (opts.remote) {
    return `Remote research inquiry — ${focusShort}`;
  }
  return `Research opportunity — ${focusShort}`;
}

function seedVariant(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h % 3;
}

function skillFocusForDomain(
  domain: PaperDomain,
  picks: OfferProject[],
  blob: string
): string {
  if (domain === "social_science") {
    return "Python scripting for data cleaning / analysis and building clear tools for non-technical users";
  }
  if (domain === "robotics_cv") {
    const sub = roboticsSubtheme(blob);
    if (sub === "scene_graphs_foundation") {
      return "3D simulation environments, perception, and computer vision";
    }
    const names = picks.map((p) => p.name.toLowerCase()).join(" ");
    if (/carla|aiea/i.test(names) && /vex|vision|cal poly/i.test(names)) {
      return "Python simulation environments and computer vision";
    }
    if (/carla|aiea|simulat/i.test(names)) return "Python simulation and edge-case testing";
    if (/cal poly|hardware/i.test(names)) return "hardware/software data pipelines and sensing";
    if (/vex|vision/i.test(names)) return "computer vision and sensor-feedback software";
    return "Python, computer vision, and simulation tooling";
  }
  if (domain === "ai_systems") {
    return "Python simulation, evaluation tooling, and careful systems support";
  }
  return "software tooling and careful technical execution";
}

function remotePivot(opts: {
  studentLocation?: string | null;
  physical: boolean;
  remote: boolean;
  domain: PaperDomain;
  blob: string;
}): string | null {
  if (!opts.remote || !opts.physical || opts.domain !== "robotics_cv") return null;
  const where =
    opts.studentLocation?.match(/\b([A-Za-z .]+,\s*[A-Z]{2})\b/)?.[1] ||
    "California";
  const sub = roboticsSubtheme(opts.blob);

  // Paper-specific on-site limits — never leave Kroemer "cable setups" on unrelated labs
  let onsite: string;
  if (sub === "cable_unweaving") {
    onsite = "on-site physical robot resets, cable setups, or camera calibration";
  } else if (sub === "scene_graphs_foundation") {
    onsite = "on-site physical sensor rigging, robot hardware setup, or camera calibration";
  } else if (sub === "sensing_sync") {
    onsite = "on-site instrument setup, sensor rigging, or camera calibration";
  } else if (sub === "manipulation") {
    onsite = "on-site physical robot resets, gripper setup, or camera calibration";
  } else {
    onsite = "on-site physical robot resets, sensor rigging, or camera calibration";
  }

  const softSide =
    sub === "scene_graphs_foundation"
      ? "simulation, 3D perception tooling, computer-vision, and data-pipeline work"
      : "software, simulation, computer-vision, and data-pipeline side";

  return `Since I would be contributing remotely from ${where}, I know I cannot help with ${onsite}. I can contribute on the ${softSide} that supports those experiments:`;
}

function closeOfferLine(
  domain: PaperDomain,
  remote: boolean,
  hoursShort: string,
  variant: number
): string {
  if (domain === "social_science") {
    const variants = [
      `${hoursShort} I would be glad to help your group with data cleaning, writing Python scripts for data analysis, literature reviews, or other remote research-support tasks.`,
      `${hoursShort} I would be happy to support data cleaning, Python analysis scripting, literature synthesis, or other remote research tasks your team needs.`,
      `${hoursShort} I can help with practical research support such as data cleaning, Python analysis scripts, literature review support, and related remote tasks.`,
    ];
    return variants[variant % variants.length];
  }
  if (domain === "robotics_cv" && remote) {
    const variants = [
      `${hoursShort} I would be glad to take on data processing, simulation testing, computer-vision pipeline work, or other remote software tasks that help your students move faster.`,
      `${hoursShort} I can contribute immediately on simulation evaluation, perception tooling, data processing, or other remote software work your students need.`,
      `${hoursShort} I would be happy to support simulation runs, CV pipeline debugging, and data/tooling tasks that unblock your team remotely.`,
    ];
    return variants[variant % variants.length];
  }
  if (remote) {
    return `${hoursShort} I would be glad to take on data processing, scripting, literature support, or other remote tasks that help your students move faster.`;
  }
  return `${hoursShort} I am ready to start on whichever concrete task would help most.`;
}

function buildOfferBlocks(
  picks: OfferProject[],
  domain: PaperDomain,
  blob: string
): string {
  return picks
    .map((p) => {
      const label = projectLabel(p, domain);
      const where = wherePhrase(p);
      const detail = shortDetail(detailForDomain(p, domain, blob), 220);
      let line: string;
      if (/^We\b/i.test(detail)) {
        line = `${label}: ${where}, ${detail.charAt(0).toLowerCase()}${detail.slice(1)}`;
      } else {
        const prose = detail.replace(/^I\s+/i, "");
        line = `${label}: ${where}, I ${prose.charAt(0).toLowerCase()}${prose.slice(1)}`;
      }
      // Bullet lines so Gmail HTML renderer turns them into a skim list
      return `• ${line}`;
    })
    .join("\n");
}

function orderPicks(
  picks: OfferProject[],
  domain: PaperDomain,
  blob: string
): OfferProject[] {
  if (!picks.length) return picks;
  if (domain === "robotics_cv" && /tech-?steps|lvlup/i.test(picks[0]?.name || "")) {
    return [...picks.slice(1), picks[0]].filter(Boolean);
  }
  // Scene-graph / foundation-model papers → lead with CARLA / AIEA
  if (
    domain === "robotics_cv" &&
    roboticsSubtheme(blob) === "scene_graphs_foundation" &&
    !/carla|aiea|simulat/i.test(picks[0]?.name || "")
  ) {
    const better = picks.find((p) => /carla|aiea|simulat/i.test(p.name));
    if (better) {
      return [better, ...picks.filter((p) => p !== better)];
    }
  }
  if (
    domain === "social_science" &&
    !/tech-?steps/i.test(picks[0]?.name || "")
  ) {
    const better = picks.find((p) => /tech-?steps/i.test(p.name));
    if (better) {
      return [better, ...picks.filter((p) => p !== better)];
    }
  }
  if (
    domain === "social_science" &&
    /carla|aiea|vex|hyperspectral/i.test(picks[0]?.name || "")
  ) {
    const better = picks.find((p) => /tech-?steps|cal poly/i.test(p.name));
    if (better) {
      return [better, ...picks.filter((p) => p !== better)];
    }
  }
  return picks;
}

export function buildOutreachLetter(opts: {
  greeting: string;
  studentName: string;
  school?: string | null;
  university: string;
  labName?: string | null;
  paperTitle?: string | null;
  researchFocus?: string | null;
  paper: PaperContext | null;
  projectsJson?: string | null;
  brief?: string | null;
  workMode: string;
  availabilityNotes?: string | null;
  studentLocation?: string | null;
  attach: boolean;
  docType?: string | null;
  extraLabels?: string[];
  maxProjects?: number;
  mentorshipEvidence?: MentorshipEvidence[] | null;
}): { subject: string; body: string } {
  const coreBlob = paperCoreBlob(opts.paper, opts.paperTitle);
  const fullBlob = paperBlob(opts.paper, opts.researchFocus, opts.paperTitle);
  const domain = classifyPaperDomain(coreBlob || fullBlob);
  const blob = coreBlob || fullBlob;

  const remote =
    /\bremote\b/i.test(opts.workMode) ||
    opts.workMode === "remote" ||
    !/\b(in-?person|hybrid|local)\b/i.test(opts.workMode);
  const physical = isPhysicalLabDomain(domain, blob);

  const projects = parseOfferProjects({
    projectsJson: opts.projectsJson,
    brief: opts.brief,
  });
  const ranked = projects
    .map((p) => ({ p, score: rankProjectForPaper(p, blob) }))
    .filter((r) => r.score > -10)
    .sort((a, b) => b.score - a.score);
  const max = opts.maxProjects ?? 2;
  const picks = orderPicks(
    ranked.slice(0, max).map((r) => r.p),
    domain,
    blob
  );

  const skills = skillFocusForDomain(domain, picks, blob);
  const variant = seedVariant(
    `${opts.greeting}|${opts.paperTitle || ""}|${opts.university}|${opts.labName || ""}`
  );
  const college = (() => {
    const s = opts.school || "";
    if (/folsom\s+lake/i.test(s)) return "Folsom Lake College";
    if (/&/.test(s)) {
      const parts = s.split("&").map((x) => x.trim());
      const collegePart = parts.find((p) => /college|university/i.test(p));
      return collegePart || parts[parts.length - 1] || s;
    }
    return s || "community college";
  })();

  const intro = `I am ${opts.studentName}, a high school student dual-enrolled at ${college}. ${askLine(
    {
      university: opts.university,
      labName: opts.labName,
      remote,
      skillFocus: skills,
      variant,
    }
  )} (I am looking for research experience, not an undergrad admissions edge.)`;

  const paperTitle = opts.paper?.title || opts.paperTitle || null;
  const paperPara = paperTitle
    ? `I was drawn to your group's work after reading "${paperTitle}." ${technicalPaperHook(
        paperTitle,
        opts.paper?.abstract || null
      )}`
    : `I am reaching out because of your work on ${(opts.researchFocus || "your research agenda").split(/[.;\n]/)[0]?.trim()}.`;

  const bridge = curiosityBridge(domain, blob, variant);

  const mentorshipLine = mentorshipEmailLine({
    evidence: opts.mentorshipEvidence || [],
    researchFocus: opts.researchFocus,
    paperTitle,
    labName: opts.labName,
  });

  const pivot = remotePivot({
    studentLocation: opts.studentLocation,
    physical,
    remote,
    domain,
    blob,
  });

  const offerIntro =
    pivot ||
    (picks.length
      ? "Here is the experience I would bring to concrete tasks in your group:"
      : "");

  const offer = picks.length ? buildOfferBlocks(picks, domain, blob) : "";

  const hours = formalizeAvailabilityHours(opts.availabilityNotes);
  const hoursShort = hours
    .replace(/^I am available for\s+/i, "I have ")
    .replace(/\.\s*I am available to contribute remotely\.?/i, ".")
    .replace(/\s+$/, "")
    .replace(/[.]*$/, ".");
  const closeAvail = closeOfferLine(domain, remote, hoursShort, variant);

  const phrase = credentialPhrase(opts.docType);
  const extras = (opts.extraLabels || []).filter(
    (l) => !/^(cv|resume|cv\/resume)$/i.test(l)
  );
  const attachLine = opts.attach
    ? extras.length
      ? `I have attached ${phrase} and ${extras.join(", ")} for your review.`
      : `I have attached ${phrase} for your review.`
    : "I would be glad to share a one-page resume if useful.";

  const meetingVariants = [
    "If you or someone in your group is open to discussing research opportunities, I would be grateful for a brief 10-minute call when convenient.",
    "Would you be open to a short 10-minute conversation to see whether I could help on a current project?",
    "I would appreciate the chance to connect briefly (about 10 minutes) if that works for your schedule.",
  ];
  const meeting = meetingVariants[variant % meetingVariants.length];

  const body = [
    opts.greeting,
    "",
    intro,
    "",
    paperPara,
    "",
    ...(mentorshipLine ? [mentorshipLine, ""] : []),
    bridge,
    "",
    offerIntro,
    offer ? `\n${offer}` : "",
    "",
    closeAvail,
    "",
    `${meeting} ${attachLine}`,
    "",
    "Thank you for your time,",
    "",
    opts.studentName,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    subject: subjectForLetter({
      domain,
      paperTitle,
      researchFocus: opts.researchFocus,
      remote,
    }),
    body,
  };
}
