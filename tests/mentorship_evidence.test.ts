/**
 * Lab-page mentorship evidence + email personalization.
 * Run: npx tsx tests/mentorship_evidence.test.ts
 */
import assert from "node:assert/strict";
import {
  extractMentorshipEvidence,
  hasHighSchoolLabEvidence,
  isTrustedLabPageUrl,
  mentorshipEmailLine,
  mentorshipMatchBonus,
} from "../src/services/mentorship_evidence";
import { buildOutreachLetter } from "../src/services/outreach_letter";
import { scoreProfessorMatch } from "../src/services/match_scorer";

const LAB_URL = "https://robotics.csail.mit.edu/people";

const labPageWithHs = `
<h2>Team</h2>
<ul>
  <li>Dr. Jane Kroemer — PI</li>
  <li>Alex Chen — Undergraduate Researcher</li>
  <li>Maya Patel — High School Student (summer 2024)</li>
</ul>
`;

const newsPage = `
https://news.mit.edu/2024/high-school-student-wins-award
Some high school student interned somewhere.
`;

assert.equal(isTrustedLabPageUrl(LAB_URL), true);
assert.equal(
  isTrustedLabPageUrl("https://news.mit.edu/2024/story"),
  false
);

const evidence = extractMentorshipEvidence(labPageWithHs, LAB_URL);
assert.ok(hasHighSchoolLabEvidence(evidence), "should detect HS on lab team page");
assert.equal(
  extractMentorshipEvidence(newsPage, "https://news.mit.edu/2024/story").length,
  0,
  "news pages must not count"
);

const line = mentorshipEmailLine({
  evidence,
  researchFocus: "robotic manipulation and computer vision",
});
assert.match(line, /high school researchers/i);
assert.match(line, /robotic manipulation/i);

const noLine = mentorshipEmailLine({
  evidence: extractMentorshipEvidence(
    "<p>Our team includes graduate students only.</p>",
    LAB_URL
  ),
  researchFocus: "robotics",
});
assert.equal(noLine, "", "no line without HS lab evidence");

const bonus = mentorshipMatchBonus(evidence);
assert.ok(bonus.bonus >= 15);

const base = scoreProfessorMatch({
  researchInterests: "robotics computer vision",
  skillsText: "python",
  professor: {
    researchFocus: "robotic manipulation",
    recentPaper: "Cable manipulation with visual feedback",
    tags: ["robotics"],
    labName: "Robotics Lab",
    university: "MIT",
  },
});
const boosted = scoreProfessorMatch({
  researchInterests: "robotics computer vision",
  skillsText: "python",
  mentorshipEvidence: evidence,
  professor: {
    researchFocus: "robotic manipulation",
    recentPaper: "Cable manipulation with visual feedback",
    tags: ["robotics"],
    labName: "Robotics Lab",
    university: "MIT",
  },
});
assert.ok(boosted.score > base.score, "mentorship should boost match silently");

const { body: withHs } = buildOutreachLetter({
  greeting: "Dear Dr. Kroemer,",
  studentName: "Taksh Nahata",
  school: "Folsom Lake College",
  university: "MIT",
  labName: "Robotics Lab",
  paperTitle: "Cable manipulation",
  researchFocus: "robotic manipulation",
  paper: null,
  workMode: "remote",
  attach: false,
  mentorshipEvidence: evidence,
});
assert.match(withHs, /high school researchers/i);

const { body: without } = buildOutreachLetter({
  greeting: "Dear Dr. Kroemer,",
  studentName: "Taksh Nahata",
  school: "Folsom Lake College",
  university: "MIT",
  researchFocus: "robotic manipulation",
  paper: null,
  workMode: "remote",
  attach: false,
  mentorshipEvidence: [],
});
assert.doesNotMatch(without, /high school researchers/i);

console.log("mentorship_evidence.test.ts: all passed");
