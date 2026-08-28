/**
 * Reply parser tests (referrals, GTSAM-style declines, URL extraction).
 * Run: npx tsx tests/reply_parser.test.ts
 */
import assert from "node:assert/strict";
import { parseProfessorReply } from "../src/services/reply_parser";

const DELLAERT_REPLY = `Hi

Thanks for contacting me. Unfortunately, all my time is taking up working with collaborators that are already at Georgia Tech. One way to get into research that is of interest to me is through working with GTSAM, and contributing somehow to the open source community around it. But I will not be able to personally supervise anything.

Best of luck.

Frank Dellaert`;

console.log("\n== GTSAM referral from polite decline");
{
  const parsed = parseProfessorReply(DELLAERT_REPLY, {
    professorName: "Frank Dellaert",
  });
  assert.equal(parsed.sentiment, "referral");
  assert.match(parsed.headline, /GTSAM/i);
  assert.match(parsed.recommendation || "", /GTSAM|open source/i);
  assert.ok(parsed.opportunities.some((o) => /GTSAM/i.test(o.title)));
  assert.ok(parsed.opportunities.some((o) => o.type === "open_source"));
}

console.log("\n== URL extraction");
{
  const parsed = parseProfessorReply(
    "Try our lab page https://example.com/lab and apply there.",
    { professorName: "Dr. Smith" }
  );
  assert.ok(parsed.links.some((l) => l.url.includes("example.com/lab")));
}

console.log("\nAll reply_parser tests passed.\n");
