/**
 * CC / polish edge cases for algorithmic outreach.
 * Run: npx tsx tests/outreach_recipients.test.ts
 */
import assert from "node:assert/strict";
import {
  formatCcForStorage,
  normalizeCcList,
  parseSpecialInstructions,
  pickCcRecipients,
  polishOutreachLetter,
} from "../src/services/outreach_recipients";
import { extractFacultyHeuristic } from "../src/services/faculty_page_heuristic";

// --- normalizeCcList ---
assert.deepEqual(
  normalizeCcList(
    ["LAB@MIT.EDU", "lab@mit.edu", "prof@mit.edu"],
    "prof@mit.edu"
  ),
  ["lab@mit.edu"]
);

assert.deepEqual(
  normalizeCcList(["noreply@mit.edu", "lab.admin@mit.edu"], "prof@mit.edu"),
  ["lab.admin@mit.edu"]
);

// --- pickCcRecipients ---
const pageWithCc = `
Dr. Jane Kroemer
Associate Professor, MIT CSAIL
Email: jkroemer@mit.edu
Lab manager: Sarah Chen (sarah.chen@mit.edu)
Please cc lab manager on all inquiries.
`;
const cc = pickCcRecipients({
  primaryEmail: "jkroemer@mit.edu",
  pageText: pageWithCc,
  name: "Dr. Jane Kroemer",
  university: "Massachusetts Institute of Technology",
});
assert.ok(
  cc.includes("sarah.chen@mit.edu"),
  `expected lab manager CC, got ${cc.join(",")}`
);
assert.ok(
  !cc.includes("jkroemer@mit.edu"),
  "primary must not appear in CC list"
);

// --- parseSpecialInstructions ---
const special = parseSpecialInstructions(
  "Please include your research interests in the email. CC the lab manager.",
  pageWithCc
);
assert.equal(special.mentionResearchInterests, true);
assert.equal(special.ccLabContact, true);

// --- polishOutreachLetter ---
const polished = polishOutreachLetter({
  subject:
    "Prospective research student — robotics and computer vision (very long subject line that should be trimmed because it exceeds the maximum length)",
  body: `Dear Dr. Smith,

I am a student.

Here is the experience I would bring to your group:

Thank you for your time,

Alex`,
  greeting: "Dear Dr. Smith,",
  studentName: "Alex",
  researchInterests: "robotics and embodied AI",
  special,
  ccEmails: ["sarah.chen@mit.edu"],
  willAttach: true,
});
assert.ok(polished.body.includes("research interests"), "should inject interests");
assert.ok(
  polished.body.includes("copied your lab contact"),
  "should note CC when lab contact requested"
);
assert.ok(polished.subject.length <= 78, "subject should be trimmed");
assert.ok(
  !/Here is the experience I would bring/.test(polished.body) ||
    /^\s*•\s+/m.test(polished.body),
  "empty bullet section should be replaced"
);

// --- heuristic extract ---
const htmlPage = `
<html><head><title>Dr. Alex Turner | Stanford</title></head>
<body>
<h1>Dr. Alex Turner</h1>
<p>Associate Professor of Computer Science</p>
<p>Research interests: machine learning for robotics</p>
<p>Contact: aturner@stanford.edu | Lab admin: admin.robotics@stanford.edu</p>
<p>Recent publication: "Learning Visuomotor Policies from Sparse Rewards"</p>
</body></html>`;
const extracted = extractFacultyHeuristic(
  htmlPage,
  "Stanford University",
  "robotics machine learning"
);
assert.ok(extracted?.valid, "heuristic should accept faculty page");
assert.ok(extracted?.email?.includes("aturner"), "should find professor email");
assert.ok(
  extracted?.ccEmails?.some((e) => e.includes("admin")),
  "should harvest lab admin CC"
);
assert.ok(
  extracted?.recent_paper?.includes("Visuomotor"),
  "should extract paper title"
);

assert.equal(formatCcForStorage(["a@b.edu", "a@b.edu"]), "a@b.edu");

console.log("outreach_recipients.test.ts: all passed");
