import "dotenv/config";
import { readFileSync } from "fs";
import { parseCvStructured, parseRichness } from "../src/services/cv_structured_parse";

const text = readFileSync("tmp/cv_full.txt", "utf8");
const parsed = parseCvStructured(text);
console.log(
  JSON.stringify(
    {
      score: parseRichness(parsed),
      displayName: parsed.displayName,
      location: parsed.location,
      phone: parsed.phone,
      school: parsed.school,
      gradeOrYear: parsed.gradeOrYear,
      skills: parsed.skills,
      projects: parsed.projects.map((p) => ({
        name: p.name,
        role: p.role,
        details: p.details.slice(0, 120),
      })),
      achievements: parsed.achievements,
      education: parsed.education,
    },
    null,
    2
  )
);
