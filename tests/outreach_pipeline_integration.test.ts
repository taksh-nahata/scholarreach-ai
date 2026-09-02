/**
 * End-to-end pipeline checks (no network, no DB).
 * Simulates: lab page → harvest → score → letter → polish → storage.
 * Run: npx tsx tests/outreach_pipeline_integration.test.ts
 */
import assert from "node:assert/strict";
import { extractFacultyHeuristic } from "../src/services/faculty_page_heuristic";
import {
  extractMentorshipEvidence,
  mergeMentorshipEvidence,
  parseProfessorMentorshipEvidence,
  serializeMentorshipEvidence,
  mentorshipEmailLine,
  mentorshipMatchBonus,
} from "../src/services/mentorship_evidence";
import {
  formatCcForStorage,
  normalizeCcList,
  parseProfessorCc,
  pickCcRecipients,
  polishOutreachLetter,
  parseSpecialInstructions,
} from "../src/services/outreach_recipients";
import { pickBestEmailFromPage } from "../src/services/faculty_email_verifier";
import { scoreProfessorMatch } from "../src/services/match_scorer";
import { buildOutreachLetter } from "../src/services/outreach_letter";
import { buildWhyThemStory } from "../src/services/why_them_narrative";
import { scoreAcceptanceFormat } from "../src/services/email_acceptance_format";

const UNIVERSITY = "Massachusetts Institute of Technology";
const LAB_URL = "https://robotics.csail.mit.edu/people";
const PROF = "Dr. Jane Kroemer";

const labPage = `
<html><head><title>Dr. Jane Kroemer | MIT CSAIL</title></head>
<body>
<h1>Dr. Jane Kroemer</h1>
<p>Associate Professor of Electrical Engineering and Computer Science</p>
<p>Research interests: robotic manipulation, computer vision, tactile sensing</p>
<p>Email: jkroemer@mit.edu</p>
<p>Lab manager: Sarah Chen (sarah.chen@mit.edu) — please cc on inquiries.</p>
<h2>Team</h2>
<ul>
  <li>Dr. Jane Kroemer — PI</li>
  <li>Maya Patel — High School Student (2024 summer)</li>
  <li>Alex Chen — Undergraduate Researcher</li>
</ul>
<p>Recent publication: "Autonomously Unweaving Multiple Cables Using Visual Feedback"</p>
</body></html>`;

function section(title: string) {
  console.log(`\n== ${title}`);
}

section("1. Heuristic faculty extract from lab page");
const heuristic = extractFacultyHeuristic(
  labPage,
  UNIVERSITY,
  "robotics computer vision"
);
assert.ok(heuristic?.valid, "heuristic should accept faculty lab page");
assert.ok(heuristic?.email?.includes("jkroemer"), "should find professor email");
assert.ok(
  heuristic?.ccEmails?.some((e) => e.includes("sarah.chen")),
  "heuristic should find lab manager CC"
);
assert.ok(
  heuristic?.recent_paper?.includes("Unweaving"),
  "should extract paper title"
);

section("2. Email + CC + mentorship harvest (resolver path)");
const best = pickBestEmailFromPage({
  pageText: labPage.replace(/<[^>]+>/g, " "),
  name: PROF,
  university: UNIVERSITY,
  homepageUrl: LAB_URL,
});
assert.ok(best && best.email.includes("jkroemer"), "email pick should verify");

const cc = pickCcRecipients({
  primaryEmail: best!.email,
  pageText: labPage,
  name: PROF,
  university: UNIVERSITY,
});
assert.ok(cc.includes("sarah.chen@mit.edu"), `CC should include lab manager, got ${cc}`);

const mentorship = extractMentorshipEvidence(labPage, LAB_URL);
assert.ok(
  mentorship.some((m) => m.level === "high_school"),
  "should find HS student on team page"
);

section("3. Match scorer silent mentorship boost");
const without = scoreProfessorMatch({
  researchInterests: "robotics computer vision python",
  skillsText: "python opencv simulation",
  professor: {
    researchFocus: "robotic manipulation",
    recentPaper: heuristic?.recent_paper || "",
    labName: heuristic?.lab_name,
    tags: ["robotics"],
    university: UNIVERSITY,
  },
});
const withMentorship = scoreProfessorMatch({
  researchInterests: "robotics computer vision python",
  skillsText: "python opencv simulation",
  mentorshipEvidence: mentorship,
  professor: {
    researchFocus: "robotic manipulation",
    recentPaper: heuristic?.recent_paper || "",
    labName: heuristic?.lab_name,
    tags: ["robotics"],
    university: UNIVERSITY,
  },
});
assert.ok(
  withMentorship.score > without.score,
  `mentorship boost: ${without.score} → ${withMentorship.score}`
);
assert.match(withMentorship.reason, /lab page documents HS researchers/i);

section("4. Letter with HS line only when lab evidence exists");
const greeting = "Dear Dr. Kroemer,";
const { subject, body } = buildOutreachLetter({
  greeting,
  studentName: "Taksh Nahata",
  school: "Folsom Lake College",
  university: UNIVERSITY,
  labName: heuristic?.lab_name || "Robotics Lab",
  paperTitle: heuristic?.recent_paper || null,
  researchFocus: heuristic?.research_focus || "robotic manipulation",
  paper: null,
  workMode: "remote",
  attach: true,
  docType: "resume",
  mentorshipEvidence: mentorship,
});

assert.match(body, /high school researchers/i, "letter should mention HS mentorship");
assert.match(body, /Unweaving|robotic manipulation/i);

const polished = polishOutreachLetter({
  subject,
  body,
  greeting,
  studentName: "Taksh Nahata",
  researchInterests: "robotics and computer vision",
  special: parseSpecialInstructions(
    "Please include your research interests in the email. CC the lab manager."
  ),
  ccEmails: cc,
  willAttach: true,
});
assert.ok(polished.body.includes("research interests"), "polish should inject interests");
assert.ok(
  polished.body.includes("copied your lab contact"),
  "polish should note CC when page asks"
);

const formatScore = scoreAcceptanceFormat({
  subject: polished.subject,
  body: polished.body,
  willAttach: true,
  requireDualEnrollment: true,
});
assert.ok(formatScore.score >= 80, `acceptance score ${formatScore.score}`);

section("5. Letter WITHOUT mentorship evidence stays normal");
const plain = buildOutreachLetter({
  greeting,
  studentName: "Taksh Nahata",
  school: "Folsom Lake College",
  university: UNIVERSITY,
  researchFocus: "robotic manipulation",
  paper: null,
  workMode: "remote",
  attach: false,
  mentorshipEvidence: [],
});
assert.doesNotMatch(plain.body, /high school researchers/i);

section("6. Storage round-trip (DB field simulation)");
const merged = mergeMentorshipEvidence([], mentorship);
const json = serializeMentorshipEvidence(merged);
assert.ok(json, "should serialize mentorship JSON");
const parsed = parseProfessorMentorshipEvidence(json);
assert.equal(parsed.length, merged.length);
assert.ok(
  parseProfessorMentorshipEvidence(
    JSON.stringify([
      {
        level: "high_school",
        sourceUrl: "https://linkedin.com/in/fake",
        snippet: "not trusted",
      },
    ])
  ).length === 0,
  "LinkedIn sources must not persist"
);

const ccStorage = formatCcForStorage(cc);
assert.ok(ccStorage?.includes("sarah.chen@mit.edu"));
assert.deepEqual(
  parseProfessorCc(JSON.stringify(cc)),
  normalizeCcList(cc, best!.email)
);

section("7. why_them_narrative includes mentorship when present");
const story = buildWhyThemStory({
  university: UNIVERSITY,
  labName: "Robotics Lab",
  paperTitle: heuristic?.recent_paper || "Cable manipulation paper",
  researchFocus: heuristic?.research_focus || null,
  paper: null,
  mentorshipEvidence: mentorship,
});
assert.match(story, /high school researchers/i);

const storyPlain = buildWhyThemStory({
  university: UNIVERSITY,
  researchFocus: "robotics",
  paper: null,
  mentorshipEvidence: [],
});
assert.doesNotMatch(storyPlain, /high school researchers/i);

section("8. Mentorship line guardrails");
assert.equal(
  mentorshipEmailLine({ evidence: [], researchFocus: "robotics" }),
  ""
);
assert.equal(
  mentorshipEmailLine({
    evidence: extractMentorshipEvidence(
      "<p>Team: grad students only</p>",
      LAB_URL
    ),
    researchFocus: "robotics",
  }),
  ""
);

console.log("\n✅ outreach_pipeline_integration.test.ts: all passed");
