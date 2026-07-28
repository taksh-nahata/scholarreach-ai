/**
 * Seed Taksh's student_profile.json into Neon StudentProfile and mark onboarding done.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { compileProfileBrief } from "../src/services/profile_service";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.DEFAULT_USER_EMAIL || "taksh.nahata37@gmail.com";
  const profilePath = path.resolve(__dirname, "../../student_profile.json");
  if (!fs.existsSync(profilePath)) {
    throw new Error(`Missing ${profilePath}`);
  }
  const raw = JSON.parse(fs.readFileSync(profilePath, "utf8"));

  const user = await prisma.user.upsert({
    where: { email },
    update: { name: raw.name || "Taksh Nahata", onboardingComplete: true },
    create: {
      email,
      name: raw.name || "Taksh Nahata",
      onboardingComplete: true,
    },
  });

  const education = [
    {
      school: raw.education?.high_school,
      degree: "High school",
      gpa: raw.education?.gpa,
      coursework: raw.education?.key_coursework || [],
    },
    {
      school: raw.education?.community_college,
      degree: raw.education?.status,
      detail: raw.education?.college_units,
    },
  ].filter((e) => e.school);

  const achievements = Object.entries(raw.key_stats || {}).map(([k, v]) => ({
    title: k.replace(/_/g, " "),
    detail: String(v),
  }));

  const projects = (raw.projects_and_research || []).map(
    (p: { name: string; role?: string; details?: string }) => ({
      name: p.name,
      role: p.role,
      details: p.details,
    })
  );

  const skills = raw.technical_skills || {};
  const regions = ["us_west", "us_east", "remote_first"];

  const brief = compileProfileBrief({
    displayName: raw.name,
    headline: "Dual-enrollment student · robotics, CV, research internships",
    school: raw.education?.high_school,
    gradeOrYear: raw.education?.status,
    location: raw.location,
    education,
    achievements,
    projects,
    skills,
    researchInterests:
      "Computer vision, robotics, autonomous systems, hardware-software integration",
    writingStyleNotes:
      "Warm professional. No em dashes. Lead with concrete labs and competition results.",
    tonePreference: "warm_professional",
    targetRegions: regions,
    workModePref: "remote",
    availabilityNotes: raw.key_stats?.volunteer_commitment || "Volunteer hours weekly",
  });

  await prisma.studentProfile.upsert({
    where: { userId: user.id },
    update: {
      displayName: raw.name,
      headline: "Dual-enrollment student · robotics, CV, research internships",
      phone: raw.phone,
      location: raw.location,
      school: raw.education?.high_school,
      gradeOrYear: raw.education?.status,
      githubUrl: raw.github ? `https://${raw.github}` : null,
      linkedinUrl: raw.linkedin ? `https://${raw.linkedin}` : null,
      educationJson: JSON.stringify(education),
      achievementsJson: JSON.stringify(achievements),
      projectsJson: JSON.stringify(projects),
      skillsJson: JSON.stringify(skills),
      writingStyleNotes:
        "Warm professional. No em dashes. Lead with concrete labs and competition results.",
      tonePreference: "warm_professional",
      targetRegionsJson: JSON.stringify(regions),
      workModePref: "remote",
      researchInterests:
        "Computer vision, robotics, autonomous systems, hardware-software integration",
      availabilityNotes: raw.key_stats?.volunteer_commitment || null,
      interviewComplete: true,
      onboardingStep: "done",
      profileBrief: brief,
    },
    create: {
      userId: user.id,
      displayName: raw.name,
      headline: "Dual-enrollment student · robotics, CV, research internships",
      phone: raw.phone,
      location: raw.location,
      school: raw.education?.high_school,
      gradeOrYear: raw.education?.status,
      githubUrl: raw.github ? `https://${raw.github}` : null,
      linkedinUrl: raw.linkedin ? `https://${raw.linkedin}` : null,
      educationJson: JSON.stringify(education),
      achievementsJson: JSON.stringify(achievements),
      projectsJson: JSON.stringify(projects),
      skillsJson: JSON.stringify(skills),
      writingStyleNotes:
        "Warm professional. No em dashes. Lead with concrete labs and competition results.",
      tonePreference: "warm_professional",
      targetRegionsJson: JSON.stringify(regions),
      workModePref: "remote",
      researchInterests:
        "Computer vision, robotics, autonomous systems, hardware-software integration",
      availabilityNotes: raw.key_stats?.volunteer_commitment || null,
      interviewComplete: true,
      onboardingStep: "done",
      profileBrief: brief,
    },
  });

  console.log(
    JSON.stringify(
      {
        email: user.email,
        onboardingComplete: true,
        achievements: achievements.length,
        projects: projects.length,
        regions,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
