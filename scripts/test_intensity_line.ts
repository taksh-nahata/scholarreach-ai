import {
  formalWorkModeSentence,
  formalizeAvailabilityHours,
  intensityLine,
} from "../src/services/email_acceptance_format";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const informal =
  "I am available for about 15 hours per week this fall (purely volunteer) and am open to an even longer stretch if the project needs it. Just let me know about your preferences and I can try to adjust around it.";

const hours = formalizeAvailabilityHours(informal);
assert(!/Just let me know/i.test(hours), "stripped informal ask");
assert(!/\(purely volunteer\)/i.test(hours), "normalized volunteer phrasing");
assert(/remotely|remote|hybrid|in-person|flexible/i.test(formalWorkModeSentence("remote")), "mode sentence");

const leaked =
  "location-based: prefer remote; open to hybrid if Georgia Tech is within ~60 miles";
const line = intensityLine({
  availabilityNotes: informal,
  workModeLabel: leaked,
});
assert(!/location-based/i.test(line), "no leaked rules in intensity line");
assert(!/Just let me know/i.test(line), "no informal ask in intensity line");
assert(/remotely/i.test(line), "defaults leaked label to remote");
console.log("OK intensity:\n", line);
