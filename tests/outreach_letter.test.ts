/**
 * Mentor-style outreach letter checks (Kroemer / cable-unweaving case).
 * Run: npx tsx tests/outreach_letter.test.ts
 */
import assert from "node:assert/strict";
import {
  buildOutreachLetter,
  classifyPaperDomain,
  rankProjectForPaper,
  technicalPaperHook,
  toLetterVoice,
} from "../src/services/outreach_letter";
import {
  bodyHasGenericFamiliarity,
  bodyHasWeakOfferBullets,
  scoreAcceptanceFormat,
} from "../src/services/email_acceptance_format";
import type { OfferProject } from "../src/services/offer_section";

const PAPER_TITLE =
  "Autonomously Unweaving Multiple Cables Using Visual Feedback";
const PAPER_ABSTRACT =
  "Many cable management tasks involve separating out the different cables and removing tangles. We present a system that uses visual feedback to autonomously unweave cables despite occlusion and deformation.";

const projectsJson = JSON.stringify([
  {
    name: "TechSteps",
    role: "Founder",
    details:
      "Architected and launched an interactive platform designed to help non-technical users navigate technical tasks through step-by-step visual guides.",
  },
  {
    name: "AIEA Lab (Prof. Leilani Gilpin)",
    role: "Research intern",
    details:
      "Engineered autonomous vehicle safety simulation environments using Python and the CARLA Simulator to evaluate vehicle behavior under fault conditions.",
  },
  {
    name: "Cal Poly (Dr. Bo Liu's Lab)",
    role: "Research intern",
    details:
      "Programmed cross-functional hardware synchronization routines in Python to pair a hyperspectral camera with a linear slider motor for automated lab data collection.",
  },
  {
    name: "VEX Robotics (Team 20000Z)",
    role: "Lead programmer",
    details:
      "Crowned Regional Tournament Champions and received the Design Award; ranked 12th out of 80 teams at the California State Championship. Programmed autonomous routines in C++ and Python utilizing computer vision pipelines and sensor feedback loops.",
  },
] satisfies OfferProject[]);

function section(title: string) {
  console.log(`\n== ${title}`);
}

section("letter voice");
{
  assert.match(toLetterVoice("Architected and launched a platform."), /^I architected/i);
  assert.match(toLetterVoice("Crowned Regional Tournament Champions."), /^We were crowned/i);
  assert.match(toLetterVoice("Engineered autonomous vehicle safety."), /^I engineered/i);
}

section("technical hook is not abstract dump");
{
  const hook = technicalPaperHook(PAPER_TITLE, PAPER_ABSTRACT);
  assert.doesNotMatch(hook, /Many cable management tasks involve separating/i);
  assert.match(hook, /occlusion|state-estimation|visual-feedback|deformation/i);
}

section("ranking: TechSteps loses on robotics paper");
{
  const blob = `${PAPER_TITLE} ${PAPER_ABSTRACT}`.toLowerCase();
  const tech = rankProjectForPaper(
    { name: "TechSteps", details: "Architected and launched a web platform." },
    blob
  );
  const aiea = rankProjectForPaper(
    {
      name: "AIEA Lab",
      details: "Engineered CARLA simulation for fault conditions.",
    },
    blob
  );
  const calpoly = rankProjectForPaper(
    {
      name: "Cal Poly",
      details: "Hyperspectral camera hardware synchronization in Python.",
    },
    blob
  );
  assert.ok(aiea > tech, `AIEA ${aiea} should beat TechSteps ${tech}`);
  assert.ok(calpoly > tech, `Cal Poly ${calpoly} should beat TechSteps ${tech}`);
}

section("Kroemer-style letter");
{
  const { subject, body } = buildOutreachLetter({
    greeting: "Dear Dr. Kroemer,",
    studentName: "Taksh Nahata",
    school: "Folsom High School & Folsom Lake College",
    university: "Carnegie Mellon University",
    paperTitle: PAPER_TITLE,
    researchFocus: "robotic manipulation and computer vision",
    paper: {
      title: PAPER_TITLE,
      abstract: PAPER_ABSTRACT,
      insight: "visual feedback under occlusion",
      themes: ["robotics", "vision", "cables"],
      source: "title_only",
    },
    projectsJson,
    brief: "",
    workMode: "remote",
    availabilityNotes:
      "about 15 hours per week this fall on a volunteer basis, and I can increase that commitment if the project requires it",
    studentLocation: "Folsom, CA",
    attach: true,
    docType: "resume",
    maxProjects: 3,
  });

  console.log("SUBJECT:", subject);
  console.log("\n----- BODY -----\n");
  console.log(body);

  assert.match(subject, /Research inquiry/i);
  assert.doesNotMatch(body, /A concrete takeaway for me was this/i);
  assert.doesNotMatch(body, /Many cable management tasks involve separating/i);
  assert.match(body, /remotely from/i);
  assert.match(body, /cannot help with on-site|can't help with/i);
  assert.match(body, /\bI (engineered|programmed|wrote)\b/i);
  assert.doesNotMatch(body, /\bArchitected and launched\b/);
  assert.doesNotMatch(body, /\bCrowned Regional\b/);
  assert.match(body, /^• /m);
  assert.match(body, /cable setups/i); // Kroemer-only phrasing OK here

  // Lead project must not be TechSteps
  const offerStart = body.search(
    /Simulation and edge cases:|Hardware\/software data pipelines:|Computer vision:/i
  );
  assert.ok(offerStart > 0, "expected labeled offer blocks");
  const beforeSecondBreak = body.slice(offerStart, offerStart + 280);
  assert.doesNotMatch(beforeSecondBreak, /TechSteps/i);
  assert.match(beforeSecondBreak, /AIEA|Cal Poly|VEX|CARLA|hyperspectral|computer vision|C\+\+|Python/i);
  assert.match(body, /computer vision pipelines|sensor feedback|CARLA|hyperspectral/i);
  assert.doesNotMatch(body, /\bI we were\b/i);
  assert.match(
    body,
    /\.\s+(I would be glad to take on|I can contribute immediately on|I would be happy to support|I would be glad to help)/i
  );

  // Paper title cited at most once in quotes
  const quoted = [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const titleHits = quoted.filter((q) => /Unweaving Multiple Cables/i.test(q));
  assert.equal(titleHits.length, 1, `title quoted ${titleHits.length} times`);

  assert.equal(bodyHasGenericFamiliarity(body), false);
  assert.equal(bodyHasWeakOfferBullets(body), false);

  const score = scoreAcceptanceFormat({
    subject,
    body,
    willAttach: true,
    requireDualEnrollment: true,
  });
  console.log("\nscore:", score.score, "missing:", score.missing);
  assert.ok(
    score.score >= 85,
    `expected score >= 85, got ${score.score}: ${score.missing.join("; ")}`
  );
}

section("Hutchinson-style social science letter");
{
  const MIGRANT_TITLE =
    "Growing Adaptability Among Undocumented Communities During Climate-Induced Disasters: An Analysis of the Role of Migrant-Serving Organizations";
  const MIGRANT_ABSTRACT =
    "This study examines how migrant-serving organizations support undocumented communities during climate-induced disasters. We analyze organizational practices and adaptability using qualitative evidence from community organizations.";

  assert.equal(
    classifyPaperDomain(`${MIGRANT_TITLE} ${MIGRANT_ABSTRACT}`),
    "social_science"
  );

  const hook = technicalPaperHook(MIGRANT_TITLE, MIGRANT_ABSTRACT);
  assert.doesNotMatch(hook, /governance|lifecycle|physical ai|occlusion|CARLA/i);
  assert.match(hook, /adaptab|organiz|data|method|migrant|measur/i);

  const blob = `${MIGRANT_TITLE} ${MIGRANT_ABSTRACT}`.toLowerCase();
  const techSteps = rankProjectForPaper(
    {
      name: "TechSteps",
      details: "Architected and launched guides for non-technical users.",
    },
    blob
  );
  const aiea = rankProjectForPaper(
    {
      name: "AIEA Lab",
      details: "Engineered CARLA simulation for fault conditions.",
    },
    blob
  );
  assert.ok(
    techSteps > aiea,
    `TechSteps ${techSteps} should beat AIEA/CARLA ${aiea} on social science`
  );

  const { subject, body } = buildOutreachLetter({
    greeting: "Dear Dr. Hutchinson,",
    studentName: "Taksh Nahata",
    school: "Folsom High School & Folsom Lake College",
    university: "University of Illinois",
    paperTitle: MIGRANT_TITLE,
    researchFocus: "robotics and computer vision", // should NOT pollute domain
    paper: {
      title: MIGRANT_TITLE,
      abstract: MIGRANT_ABSTRACT,
      insight: "organizational adaptability during disasters",
      themes: ["migrant", "climate", "organizations"],
      source: "title_only",
    },
    projectsJson,
    brief: "",
    workMode: "remote",
    availabilityNotes:
      "about 15 hours per week this fall on a volunteer basis, and I can increase that commitment if the project requires it",
    studentLocation: "Folsom, CA",
    attach: true,
    docType: "resume",
    maxProjects: 3,
  });

  console.log("SUBJECT:", subject);
  console.log("\n----- BODY -----\n");
  console.log(body);

  assert.match(subject, /Research inquiry/i);
  assert.doesNotMatch(body, /governance ideas into concrete checks/i);
  assert.doesNotMatch(body, /CARLA Simulator/i);
  assert.doesNotMatch(body, /hyperspectral camera/i);
  assert.doesNotMatch(body, /computer-vision pipeline/i);
  assert.doesNotMatch(body, /Simulation and edge cases:/i);
  assert.doesNotMatch(
    body,
    /Hardware\/software data pipelines:[\s\S]*LvlUp/i
  );
  assert.match(body, /adaptab|organiz|migrant|data|method/i);
  assert.match(
    body,
    /data cleaning|Python scripts for data analysis|literature reviews/i
  );
  assert.match(body, /Tooling for non-technical users:|Python data automation:/i);

  // Lead should be TechSteps or Cal Poly data, not AIEA
  const offerIdx = body.search(
    /Tooling for non-technical users:|Python data automation:/i
  );
  assert.ok(offerIdx > 0);
  assert.doesNotMatch(body.slice(offerIdx, offerIdx + 200), /CARLA|AIEA Lab/i);

  assert.equal(bodyHasGenericFamiliarity(body), false);
  const score = scoreAcceptanceFormat({
    subject,
    body,
    willAttach: true,
    requireDualEnrollment: true,
  });
  console.log("\nsocial score:", score.score, "missing:", score.missing);
  assert.ok(
    score.score >= 85,
    `expected score >= 85, got ${score.score}: ${score.missing.join("; ")}`
  );
}

section("Hauser-style FOUND-IT / 3D scene graph letter");
{
  const FOUND_TITLE =
    "FOUND-IT: Foundation-model-first Task-driven 3D Scene Graphs with Granularity on Demand";
  const FOUND_ABSTRACT =
    "We present FOUND-IT, a foundation-model-first approach to building task-driven 3D scene graphs with controllable granularity for robotic perception and spatial mapping.";

  assert.equal(
    classifyPaperDomain(`${FOUND_TITLE} ${FOUND_ABSTRACT}`),
    "robotics_cv"
  );

  const hook = technicalPaperHook(FOUND_TITLE, FOUND_ABSTRACT);
  assert.doesNotMatch(hook, /sensing toolchain|tightly synchronized/i);
  assert.match(hook, /foundation model|scene graph|granularity|CARLA|3D/i);

  const { subject, body } = buildOutreachLetter({
    greeting: "Dear Dr. Hauser,",
    studentName: "Taksh Nahata",
    school: "Folsom High School & Folsom Lake College",
    university: "University of Illinois",
    paperTitle: FOUND_TITLE,
    researchFocus: "robotic perception and 3D mapping",
    paper: {
      title: FOUND_TITLE,
      abstract: FOUND_ABSTRACT,
      insight: "foundation models for 3D scene graphs",
      themes: ["scene graphs", "foundation models", "3D"],
      source: "title_only",
    },
    projectsJson,
    brief: "",
    workMode: "remote",
    availabilityNotes:
      "about 15 hours per week this fall on a volunteer basis, and I can increase that commitment if the project requires it",
    studentLocation: "Folsom, CA",
    attach: true,
    docType: "resume",
    maxProjects: 3,
  });

  console.log("SUBJECT:", subject);
  console.log("\n----- BODY -----\n");
  console.log(body);

  assert.doesNotMatch(body, /cable setups/i);
  assert.doesNotMatch(body, /sensing toolchain/i);
  assert.match(body, /foundation model|scene graph|granularity/i);
  assert.match(body, /sensor rigging|robot hardware setup/i);
  assert.match(body, /CARLA/i);
  assert.match(body, /^• /m);
  // Lead with simulation / CARLA
  const firstBullet = body.split("\n").find((l) => l.startsWith("• "));
  assert.ok(firstBullet);
  assert.match(firstBullet!, /Simulation|CARLA|AIEA/i);

  const score = scoreAcceptanceFormat({
    subject,
    body,
    willAttach: true,
    requireDualEnrollment: true,
  });
  console.log("\nfound-it score:", score.score, "missing:", score.missing);
  assert.equal(bodyHasWeakOfferBullets(body), false);
  assert.ok(
    score.score >= 85,
    `expected score >= 85, got ${score.score}: ${score.missing.join("; ")}`
  );
}

console.log("\nAll outreach_letter tests passed.");
