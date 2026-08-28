/**
 * Reliability helper tests (oauth state, match scoring).
 * Run: npx tsx tests/reliability_helpers.test.ts
 */
import assert from "node:assert/strict";
import {
  createGmailOAuthState,
  parseGmailOAuthState,
} from "../src/lib/oauth_state";
import { scoreProfessorMatch } from "../src/services/match_scorer";
import { looksLikeUnsubscribe } from "../src/services/email_suppression";

process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "test-secret";

console.log("\n== oauth state");
{
  const state = createGmailOAuthState("user_abc");
  const parsed = parseGmailOAuthState(state);
  assert.equal(parsed?.userId, "user_abc");
  assert.equal(parseGmailOAuthState("tampered.payload"), null);
  assert.equal(parseGmailOAuthState(state.slice(0, -2) + "xx"), null);
}

console.log("\n== match scorer phrase + paper");
{
  const weak = scoreProfessorMatch({
    researchInterests: "robotics computer vision",
    skillsText: "python pytorch",
    professor: { researchFocus: "medieval history", tags: [] },
  });
  const strong = scoreProfessorMatch({
    researchInterests: "robotics computer vision deep learning",
    skillsText: "pytorch python",
    professor: {
      researchFocus: "robotics computer vision",
      recentPaper: "Deep Learning for Robot Vision",
      tags: ["robotics", "vision"],
    },
  });
  assert.ok(strong.score > weak.score, `${strong.score} vs ${weak.score}`);
  assert.ok(strong.score >= 50);
}

console.log("\n== unsubscribe heuristic");
{
  assert.equal(looksLikeUnsubscribe("Please remove me from your list"), true);
  assert.equal(looksLikeUnsubscribe("Happy to chat next week"), false);
}

console.log("\nAll reliability helper tests passed.");
