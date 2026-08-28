/**
 * Unit checks for faculty email scoring / harvest (no network).
 * Run: npx tsx tests/faculty_email_scoring.test.ts
 */
import assert from "node:assert/strict";
import {
  harvestEmailsFromText,
  isJunkFacultyEmail,
  nameMatchesLocalPart,
  pageMentionsName,
  pickBestEmailFromPage,
  scoreEmailCandidate,
  unscrambleEmail,
  EMAIL_VERIFY_THRESHOLD,
} from "../src/services/faculty_email_verifier";
import {
  domainsForUniversity,
  emailMatchesUniversityDomains,
} from "../src/lib/university_email_domains";

function section(title: string) {
  console.log(`\n== ${title}`);
}

section("unscramble + harvest");
{
  const text =
    "Contact: Jane Smith (jane.smith at cs dot columbia dot edu). Also info@cs.columbia.edu";
  const emails = harvestEmailsFromText(text);
  assert.ok(
    emails.some((e) => e.includes("jane.smith@") && e.includes("columbia")),
    `expected jane.smith, got ${emails.join(",")}`
  );
  assert.ok(
    !emails.includes("info@cs.columbia.edu"),
    "junk info@ should be filtered"
  );
  assert.equal(
    unscrambleEmail("vondrick at cs dot columbia dot edu"),
    "vondrick@cs.columbia.edu"
  );
}

section("junk / student filters");
{
  assert.equal(isJunkFacultyEmail("info@mit.edu"), true);
  assert.equal(isJunkFacultyEmail("admissions@stanford.edu"), true);
  assert.equal(isJunkFacultyEmail("jsmith@students.berkeley.edu"), true);
  assert.equal(isJunkFacultyEmail("jane.smith@columbia.edu"), false);
}

section("name match");
{
  assert.equal(
    nameMatchesLocalPart("Dr. Jane Smith", "jane.smith@columbia.edu"),
    true
  );
  assert.equal(nameMatchesLocalPart("Jane Smith", "jsmith@columbia.edu"), true);
  assert.equal(nameMatchesLocalPart("Jane Smith", "xyz123@columbia.edu"), false);
}

section("domain map");
{
  const domains = domainsForUniversity("Columbia University");
  assert.ok(domains.includes("columbia.edu"));
  assert.equal(
    emailMatchesUniversityDomains("js@cs.columbia.edu", domains),
    true
  );
  assert.equal(
    emailMatchesUniversityDomains("js@mit.edu", domains),
    false
  );
}

section("page identity");
{
  const page = `
    Jane Smith — Associate Professor
    Columbia University Department of Computer Science
    Email: jane.smith@columbia.edu
  `;
  assert.equal(pageMentionsName(page, "Jane Smith"), true);
  assert.equal(pageMentionsName(page, "John Doe"), false);
}

section("score: correct email on page");
{
  const page = `Professor Jane Smith, Columbia University. jane.smith@columbia.edu`;
  const scored = scoreEmailCandidate({
    email: "jane.smith@columbia.edu",
    name: "Jane Smith",
    university: "Columbia University",
    homepageUrl: "https://www.cs.columbia.edu/~jane",
    pageText: page,
  });
  assert.ok(
    scored.score >= EMAIL_VERIFY_THRESHOLD,
    `expected high score, got ${scored.score} ${scored.reasons}`
  );
  assert.equal(scored.foundInPage, true);
  const best = pickBestEmailFromPage({
    pageText: page,
    name: "Jane Smith",
    university: "Columbia University",
    homepageUrl: "https://www.cs.columbia.edu/~jane",
  });
  assert.ok(best);
  assert.equal(best!.email, "jane.smith@columbia.edu");
}

section("score: colleague email rejected");
{
  const page = `Jane Smith lab. Contact Bob Other: bob.other@mit.edu`;
  const best = pickBestEmailFromPage({
    pageText: page,
    name: "Jane Smith",
    university: "Columbia University",
    homepageUrl: "https://www.cs.columbia.edu/~jane",
  });
  assert.equal(best, null, "should not pick MIT colleague for Columbia prof");
}

section("score: invent not on page never verifies via pick");
{
  const page = `Jane Smith, Columbia. No email listed.`;
  const scored = scoreEmailCandidate({
    email: "jane.smith@columbia.edu",
    name: "Jane Smith",
    university: "Columbia University",
    pageText: page,
  });
  assert.equal(scored.foundInPage, false);
  const best = pickBestEmailFromPage({
    pageText: page,
    name: "Jane Smith",
    university: "Columbia University",
  });
  assert.equal(best, null);
}

section("directory with email vs personal fallback simulation");
{
  const directoryNoEmail = `Dr. Jane Smith, Associate Professor, Columbia University. Research in ML.`;
  assert.equal(
    pickBestEmailFromPage({
      pageText: directoryNoEmail,
      name: "Jane Smith",
      university: "Columbia University",
      homepageUrl: "https://www.cs.columbia.edu/people/jane-smith",
    }),
    null
  );
  const personal = `Jane Smith personal site. Reach me at jane.smith@cs.columbia.edu`;
  const fromPersonal = pickBestEmailFromPage({
    pageText: personal,
    name: "Jane Smith",
    university: "Columbia University",
    homepageUrl: "https://jane-smith.github.io",
  });
  assert.ok(fromPersonal);
  assert.equal(fromPersonal!.email, "jane.smith@cs.columbia.edu");
}

console.log("\nAll faculty email scoring tests passed.");
